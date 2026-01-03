// src/modules/invoice/invoice.service.ts
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateInvoiceDTO, InvoiceCategory } from "./dto/createInvoice.dto";
import { PayInvoiceDTO } from "./dto/updateInvoice.dto";

@injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  async createInvoice(userId: string, data: CreateInvoiceDTO) {
    const {
      orderId,
      category,
      status,
      method,
      dpPercentage,
      customAmount,
      dueDate,
    } = data;

    // 1. Ambil Data Order
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        products: true,
        client: true, // Butuh ID client
      },
    });

    if (!order) {
      throw new ApiError("Order not found", 404);
    }

    // 2. Hitung Total Amount Invoice berdasarkan Kategori
    let invoiceAmount = Number(order.totalAmount); // Default Full Payment

    if (category === InvoiceCategory.DP) {
      if (!dpPercentage) {
        throw new ApiError("dpPercentage is required for DP Invoice", 400);
      }
      // Rumus: Total Order * (Persen / 100)
      invoiceAmount = Math.floor(invoiceAmount * (dpPercentage / 100));
    } else if (
      category === InvoiceCategory.INSTALLMENT ||
      category === InvoiceCategory.REMAINING_BALANCE
    ) {
      // Jika user input nominal manual
      if (customAmount) {
        invoiceAmount = customAmount;
      } else {
        throw new ApiError(
          "customAmount is required for Installment/Remaining Balance",
          400,
        );
      }
    }

    // 3. Siapkan Data Items
    // Map dari OrderProduct ke InvoiceItem
    const invoiceItemsData = order.products.map((op) => ({
      productId: op.productId,
      quantity: op.quantity,
      price: op.unitPrice,
    }));

    // 4. Create Invoice ke Database
    const newInvoice = await this.prisma.invoice.create({
      data: {
        orderId: order.id,
        clientId: order.clientId,
        userId: userId,

        // Field Invoice sesuai Schema
        totalAmount: invoiceAmount,
        status: status || undefined, // Biarkan default Prisma (UNPAID) jika null/undefined
        category: category,
        method: method || undefined, // Nullable di schema
        dueDate: dueDate ? new Date(dueDate) : undefined,

        // Relasi Items
        items: {
          create: invoiceItemsData,
        },
      },
      include: {
        items: {
          include: {
            product: { select: { name: true, sku: true } },
          },
        },

        client: {
          select: {
            id: true,
            custCode: true,
            type: true,
            b2b: { select: { companyName: true, email: true } },
            b2c: { select: { name: true } },
          },
        },
        order: { select: { poNumber: true } },
      },
    });

    return newInvoice;
  }

  async payInvoice(invoiceId: string, data: PayInvoiceDTO) {
    // 1. Cek Invoice
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) throw new ApiError("Invoice not found", 404);
    if (invoice.status === "PAID")
      throw new ApiError("Invoice is already paid", 400);
    if (invoice.status === "CANCELLED")
      throw new ApiError("Cannot pay cancelled invoice", 400);

    // 2. Update Status & Method
    const updatedInvoice = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "PAID",
        method: data.method,
        updatedAt: new Date(data.paymentDate),
      },
    });

    return updatedInvoice;
  }

  async getAllInvoices(query: {
    page?: number;
    take?: number;
    search?: string;
    status?: string; // Filter Status (UNPAID, PAID, etc)
    category?: string; // Filter Kategori (DP, FULL_PAYMENT)
    startDate?: string;
    endDate?: string;
  }) {
    const where: any = {};

    // 1. Filter Pencarian (Client Name B2B/B2C atau PO Number)
    if (query.search && query.search.trim() !== "") {
      const searchTerm = query.search.trim();
      where.OR = [
        // Cari berdasarkan Nama Perusahaan (B2B)
        {
          client: {
            b2b: { is: { companyName: { contains: searchTerm } } },
          },
        },
        // Cari berdasarkan Nama Perorangan (B2C)
        {
          client: {
            b2c: { is: { name: { contains: searchTerm } } },
          },
        },
        // Cari berdasarkan PO Number dari Order terkait
        {
          order: { is: { poNumber: { contains: searchTerm } } },
        },
      ];
    }

    // 2. Filter Status & Kategori
    // Pastikan tidak memfilter jika string "ALL" dikirim dari frontend
    if (query.status && query.status !== "ALL") {
      where.status = query.status;
    }

    if (query.category && query.category !== "ALL") {
      where.category = query.category;
    }

    // 3. Filter Tanggal (Berdasarkan CreatedAt)
    if (query.startDate || query.endDate) {
      const dateFilter: any = {};

      if (query.startDate) {
        const start = new Date(query.startDate);
        if (!isNaN(start.getTime())) {
          dateFilter.gte = start;
        }
      }

      if (query.endDate) {
        const end = new Date(query.endDate);
        if (!isNaN(end.getTime())) {
          end.setDate(end.getDate() + 1); // +1 hari agar inklusif
          dateFilter.lt = end;
        }
      }

      if (Object.keys(dateFilter).length > 0) {
        where.createdAt = dateFilter;
      }
    }

    // === Pagination & Query Data ===
    const count = await this.prisma.invoice.count({ where });

    const invoices = await this.prisma.invoice.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { createdAt: "desc" }, // Urutkan dari yang terbaru
      include: {
        client: {
          include: { b2b: true, b2c: true },
        },
        order: {
          select: { poNumber: true }, // Ambil PO Number
        },
        _count: {
          select: { items: true }, // Hitung jumlah item di invoice
        },
      },
    });

    // === Format Data untuk Frontend Table ===
    const formattedData = invoices.map((inv) => {
      // 1. Tentukan Nama Client (Flattening)
      let clientName = "-";
      if (inv.client?.b2b) {
        clientName = inv.client.b2b.companyName;
      } else if (inv.client?.b2c) {
        clientName = inv.client.b2c.name;
      }

      return {
        id: inv.id,
        invoiceDate: inv.createdAt, // Tanggal buat
        dueDate: inv.dueDate, // Jatuh tempo
        poNumber: inv.order?.poNumber || "-",
        clientName: clientName,
        totalAmount: Number(inv.totalAmount),
        status: inv.status,
        category: inv.category,
        method: inv.method || "-",
        totalItems: inv._count.items,
      };
    });

    const meta = this.pagination.generateMeta({
      page: Number(query.page || 1),
      take: Number(query.take || 10),
      count,
    });

    return { data: formattedData, meta };
  }

  async getInvoiceDetail(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { name: true, sku: true } },
          },
        },
        client: {
          include: {
            b2b: { include: { department: true, pics: true } },
            b2c: true,
          },
        },
        order: { select: { poNumber: true } },
      },
    });

    if (!invoice) throw new ApiError("Invoice not found", 404);

    return invoice;
  }
}
