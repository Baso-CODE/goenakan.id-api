// src/modules/invoice/invoice.service.ts
import { Prisma } from "@prisma/client";
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from "date-fns";
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
      selectedItems,
      notes,
    } = data;

    // 0. Validasi User
    const userExists = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!userExists) {
      throw new ApiError("User tidak valid. Silakan login ulang.", 401);
    }

    // 1. Ambil Data Order
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        products: true,
        client: true,
        invoices: true,
      },
    });

    if (!order) {
      throw new ApiError("Order not found", 404);
    }

    let invoiceAmount = 0;
    let targetOrderProducts: any[] = [];

    if (selectedItems && selectedItems.length > 0) {
      targetOrderProducts = order.products
        .filter((op) =>
          selectedItems.some(
            (sel) => sel.productId === op.productId || sel.productId === op.id,
          ),
        )
        .map((op) => {
          const selected = selectedItems.find(
            (sel) => sel.productId === op.productId || sel.productId === op.id,
          );

          const quantityToBill = selected
            ? Number(selected.quantity)
            : op.quantity;

          return { ...op, quantityToBill };
        });

      if (targetOrderProducts.length === 0) {
        console.warn(
          "⚠️ Warning: Tidak ada produk yang cocok dengan selectedItems!",
        );
      }

      // Hitung Total Amount
      invoiceAmount = targetOrderProducts.reduce((sum, item) => {
        return sum + Number(item.unitPrice) * item.quantityToBill;
      }, 0);
    } else {
      targetOrderProducts = order.products.map((op) => ({
        ...op,
        quantityToBill: op.quantity,
      }));

      const totalOrderAmount = Number(order.totalAmount);

      if (category === InvoiceCategory.FULL_PAYMENT) {
        invoiceAmount = totalOrderAmount;
      } else if (category === InvoiceCategory.DP) {
        if (!dpPercentage)
          throw new ApiError("dpPercentage required for DP", 400);
        invoiceAmount = Math.floor(totalOrderAmount * (dpPercentage / 100));
      } else if (category === InvoiceCategory.REMAINING_BALANCE) {
        const totalInvoiced = order.invoices.reduce((sum, inv) => {
          if (inv.status !== "CANCELLED") return sum + Number(inv.totalAmount);
          return sum;
        }, 0);
        invoiceAmount = totalOrderAmount - totalInvoiced;
        if (invoiceAmount <= 0) throw new ApiError("Order sudah lunas.", 400);
      } else if (category === InvoiceCategory.INSTALLMENT) {
        if (!customAmount) throw new ApiError("customAmount required", 400);
        invoiceAmount = customAmount;
      }
    }

    // 3. Mapping Data ke InvoiceItem
    const invoiceItemsData = targetOrderProducts.map((op) => {
      const customData = op.customization
        ? (op.customization as Prisma.InputJsonValue)
        : Prisma.JsonNull;

      return {
        productId: op.productId,
        quantity: op.quantityToBill,
        price: op.unitPrice,
        variantId: op.variantId,
        remarks: op.remarks,
        customization: customData,
      };
    });

    // 4. TRANSACTION
    const result = await this.prisma.$transaction(async (tx) => {
      // A. Create Invoice
      const createdInvoice = await tx.invoice.create({
        data: {
          orderId: order.id,
          clientId: order.clientId,
          userId: userId,
          totalAmount: invoiceAmount,
          status: status || undefined,
          category: category,
          method: method || undefined,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          items: {
            createMany: {
              data: invoiceItemsData,
            },
          },
          notes:
            notes && notes.length > 0
              ? {
                  createMany: {
                    data: notes.map((note) => ({
                      categoryId: note.categoryId,
                      content: note.content,
                    })),
                  },
                }
              : undefined,
        },
      });

      // B. Generate Invoice Number & Update
      const id = createdInvoice.id;
      const clientCode = order.client.custCode
        ? order.client.custCode.toUpperCase()
        : "NOC";
      const date = new Date();
      const month = ("0" + (date.getMonth() + 1)).slice(-2);
      const year = date.getFullYear();
      const formattedInvoiceNumber = `INV/${id}/${clientCode}/${month}/${year}`;

      const updatedInvoice = await tx.invoice.update({
        where: { id: id },
        data: { invoiceNumber: formattedInvoiceNumber },
        include: {
          items: {
            include: {
              product: { select: { name: true, sku: true } },
            },
          },
          client: { select: { id: true, custCode: true, type: true } },
          order: { select: { poNumber: true } },
        },
      });

      return updatedInvoice;
    });

    return result;
  }

  async payInvoice(invoiceId: number, data: PayInvoiceDTO) {
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
    status?: string;
    category?: string;
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
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          include: { b2b: true, b2c: true },
        },
        order: {
          select: { poNumber: true },
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
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.createdAt,
        dueDate: inv.dueDate,
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

  async getInvoiceDetail(id: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        // 1. Client Info (Untuk Header Invoice)
        client: {
          include: {
            b2b: { include: { department: true, pics: true } },
            b2c: true,
          },
        },

        // 2. Order Info (Untuk PO Number & Footer Sales)
        order: {
          select: {
            id: true,
            poNumber: true,
            dateOrder: true,

            // Ambil Data Sales & Bank Account (Untuk Tanda Tangan & Info Transfer)
            sales: {
              select: {
                name: true,
                phone: true,
                signatureUrl: true,
                bankAccounts: {
                  select: {
                    bankName: true,
                    accountNumber: true,
                    accountHolderName: true,
                  },
                },
              },
            },

            // [OPTIMISASI] Kita hapus 'products' dari sini.
            // Alasannya: Data produk yang valid untuk invoice ini (terutama Split Invoice)
            // ada di 'invoice.items' di bawah.
          },
        },

        // 3. Invoice Items (SUMBER UTAMA DATA TABLE)
        items: {
          include: {
            // Ambil Nama Produk Master
            product: {
              select: { name: true, sku: true, materialType: true },
            },
            // Ambil Nama Varian (Relasi langsung dari InvoiceItem)
            variant: {
              select: { variantName: true, sku: true },
            },
            // Field 'remarks' dan 'customization' otomatis terambil
            // karena merupakan field native di tabel InvoiceItem
          },
        },

        notes: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!invoice) throw new ApiError("Invoice not found", 404);

    return invoice;
  }
  async getMonthlyRevenueChart(month: number, year: number) {
    // 1. Tentukan Range Tanggal (Awal s/d Akhir Bulan)
    const startDate = startOfMonth(new Date(year, month - 1));
    const endDate = endOfMonth(new Date(year, month - 1));

    // 2. Ambil Invoice yang sudah PAID di range tersebut
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: "PAID",
        updatedAt: {
          // Gunakan updatedAt (tanggal bayar) bukan createdAt
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        updatedAt: true,
        totalAmount: true,
      },
    });

    // 3. Generate semua tanggal dalam bulan tersebut (1, 2, 3... 30/31)
    const allDays = eachDayOfInterval({ start: startDate, end: endDate });

    // 4. Mapping Data (Gabungkan tanggal kosong dengan data invoice)
    const chartData = allDays.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");

      // Cari invoice yang dibayar pada tanggal ini
      const dailyTotal = invoices
        .filter((inv) => format(inv.updatedAt, "yyyy-MM-dd") === dateStr)
        .reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

      return {
        date: format(day, "dd MMM"), // Format tampilan: "01 Jan"
        revenue: dailyTotal,
      };
    });

    return chartData;
  }
}
