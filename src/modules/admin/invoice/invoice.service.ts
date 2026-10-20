// src/modules/invoice/invoice.service.ts
import { InvoiceBillingMode, Prisma } from "@prisma/client";
import { format } from "date-fns";
import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { OrderService } from "../order/order.service";
import {
  CreateInvoiceDTO,
  InvoiceCategory,
  InvoiceStatus,
} from "./dto/createInvoice.dto";
import { PayInvoiceDTO } from "./dto/updateInvoice.dto";

@injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly orderService: OrderService,
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
      paymentDate,
      paidAt,
      selectedItems,
      notes,
    } = data;
    const billingMode = data.billingMode ?? InvoiceBillingMode.STANDARD;
    if (status === InvoiceStatus.PAID)
      throw new ApiError(
        "Gunakan endpoint pembayaran untuk melunasi invoice",
        400,
      );
    if (paymentDate || paidAt)
      throw new ApiError(
        "Tanggal pembayaran hanya diisi saat konfirmasi pembayaran",
        400,
      );
    if (status === InvoiceStatus.CANCELLED || status === InvoiceStatus.OVERDUE)
      throw new ApiError("Status awal invoice harus DRAFT atau UNPAID", 400);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user)
      throw new ApiError("User tidak valid. Silakan login ulang.", 401);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            client: { select: { custCode: true } },
            products: true,
            invoices: {
              where: {
                status: {
                  notIn: [InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT],
                },
              },
              include: {
                items: { select: { orderProductId: true, quantity: true } },
              },
            },
          },
        });
        if (!order) throw new ApiError("Order tidak ditemukan", 404);
        if (order.products.length === 0)
          throw new ApiError("Order belum mempunyai produk", 400);

        const previousInvoices = order.invoices;
        if (
          previousInvoices.some(
            (invoice) => invoice.billingMode !== billingMode,
          )
        )
          throw new ApiError(
            "Order ini sudah mempunyai invoice dengan mode billing berbeda",
            400,
          );

        const orderTotal = new Prisma.Decimal(order.totalAmount);
        const invoicedTotal = previousInvoices.reduce(
          (sum, invoice) => sum.plus(invoice.totalAmount),
          new Prisma.Decimal(0),
        );
        const remainingValue = orderTotal.minus(invoicedTotal);
        if (remainingValue.lte(0))
          throw new ApiError("Nilai order sudah seluruhnya ditagihkan", 400);

        type OrderLine = (typeof order.products)[number];
        let itemsToBill: { orderProduct: OrderLine; quantity: number }[] = [];
        let invoiceAmount = new Prisma.Decimal(0);

        if (billingMode === InvoiceBillingMode.PARTIAL_QUANTITY) {
          if (category === InvoiceCategory.DP)
            throw new ApiError(
              "DP tidak didukung pada mode PARTIAL_QUANTITY",
              400,
            );
          if (dpPercentage !== undefined || customAmount !== undefined)
            throw new ApiError(
              "Partial billing dihitung dari quantity, bukan nominal custom",
              400,
            );
          if (!selectedItems?.length)
            throw new ApiError("Pilih produk untuk partial billing", 400);

          const uniqueIds = selectedItems.map((item) => item.orderProductId);
          if (new Set(uniqueIds).size !== uniqueIds.length)
            throw new ApiError(
              "Ada baris order yang dipilih lebih dari satu kali",
              400,
            );

          itemsToBill = selectedItems.map((selection) => {
            const line = order.products.find(
              (op) => op.id === selection.orderProductId,
            );
            if (!line)
              throw new ApiError(
                "Produk yang dipilih tidak terdapat pada order",
                400,
              );
            const quantity = Number(selection.quantity);
            if (!Number.isSafeInteger(quantity) || quantity < 1)
              throw new ApiError(
                "Quantity tagihan harus bilangan bulat positif",
                400,
              );
            const previouslyBilledQuantity = previousInvoices.reduce(
              (sum, inv) =>
                sum +
                inv.items
                  .filter((item) => item.orderProductId === line.id)
                  .reduce((itemSum, item) => itemSum + item.quantity, 0),
              0,
            );
            if (quantity > line.quantity - previouslyBilledQuantity)
              throw new ApiError(
                `Quantity ${line.productId} melebihi sisa yang belum ditagihkan`,
                400,
              );
            return { orderProduct: line, quantity };
          });
          invoiceAmount = itemsToBill.reduce(
            (sum, item) =>
              sum.plus(
                new Prisma.Decimal(item.orderProduct.unitPrice).mul(
                  item.quantity,
                ),
              ),
            new Prisma.Decimal(0),
          );
        } else {
          if (selectedItems?.length)
            throw new ApiError(
              "selectedItems hanya boleh digunakan untuk PARTIAL_QUANTITY",
              400,
            );
          itemsToBill = order.products.map((op) => ({
            orderProduct: op,
            quantity: op.quantity,
          }));
          switch (category) {
            case InvoiceCategory.FULL_PAYMENT:
              if (previousInvoices.length)
                throw new ApiError(
                  "Full payment hanya bisa menjadi invoice pertama",
                  400,
                );
              invoiceAmount = orderTotal;
              break;
            case InvoiceCategory.DP:
              if (previousInvoices.length)
                throw new ApiError(
                  "DP hanya bisa menjadi invoice pertama",
                  400,
                );
              if (
                dpPercentage === undefined ||
                dpPercentage <= 0 ||
                dpPercentage > 100
              )
                throw new ApiError(
                  "Persentase DP harus antara 1 sampai 100",
                  400,
                );
              invoiceAmount = orderTotal
                .mul(dpPercentage)
                .div(100)
                .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
              break;
            case InvoiceCategory.INSTALLMENT:
              if (
                customAmount === undefined ||
                !Number.isFinite(customAmount) ||
                customAmount <= 0
              )
                throw new ApiError(
                  "Nominal cicilan harus lebih besar dari nol",
                  400,
                );
              invoiceAmount = new Prisma.Decimal(customAmount);
              break;
            case InvoiceCategory.REMAINING_BALANCE:
              invoiceAmount = remainingValue;
              break;
            default:
              throw new ApiError("Kategori invoice tidak dikenal", 400);
          }
        }

        if (invoiceAmount.lte(0) || invoiceAmount.gt(remainingValue))
          throw new ApiError(
            "Total invoice harus positif dan tidak boleh melebihi sisa nilai order",
            400,
          );
        if (
          notes?.some(
            (note) => new Set(note.contents).size !== note.contents.length,
          )
        )
          throw new ApiError("Terdapat isi note duplikat dalam kategori", 400);

        const invoiceItemsData = itemsToBill.map(
          ({ orderProduct: op, quantity }) => ({
            orderProductId: op.id,
            productId: op.productId,
            variantId: op.variantId,
            quantity,
            price: op.unitPrice,
            remarks: op.remarks,
            customization: op.customization
              ? (op.customization as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          }),
        );
        const created = await tx.invoice.create({
          data: {
            orderId: order.id,
            clientId: order.clientId,
            userId,
            totalAmount: invoiceAmount,
            category,
            billingMode,
            status: status ?? InvoiceStatus.UNPAID,
            method: method ?? undefined,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            items: { createMany: { data: invoiceItemsData } },
            notes: notes?.length
              ? {
                  createMany: {
                    data: notes.flatMap((note) =>
                      note.contents.map((content) => ({
                        categoryId: note.categoryId,
                        content,
                      })),
                    ),
                  },
                }
              : undefined,
          },
        });

        const now = new Date();
        const romanMonths = [
          "I",
          "II",
          "III",
          "IV",
          "V",
          "VI",
          "VII",
          "VIII",
          "IX",
          "X",
          "XI",
          "XII",
        ];
        const sequence = String(created.id).padStart(4, "0");
        const clientCode = order.client.custCode || "NOC";
        const invoiceNumber = `INV_${sequence}_${clientCode}_${romanMonths[now.getMonth()]}_${now.getFullYear()}`;
        return tx.invoice.update({
          where: { id: created.id },
          data: { invoiceNumber },
          include: {
            items: {
              include: { product: { select: { name: true, sku: true } } },
            },
            client: { select: { id: true, custCode: true, type: true } },
            order: { select: { orderNumber: true } },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 20000,
      },
    );
    return result;
  }

  async payInvoice(invoiceId: number, data: PayInvoiceDTO) {
    const paidDate = new Date(data.paymentDate);
    if (Number.isNaN(paidDate.getTime()))
      throw new ApiError("Tanggal pembayaran tidak valid", 400);

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, orderId: true },
    });
    if (!invoice) throw new ApiError("Invoice tidak ditemukan", 404);
    if (invoice.status === InvoiceStatus.PAID)
      throw new ApiError("Invoice sudah dibayar", 400);
    if (invoice.status === InvoiceStatus.CANCELLED)
      throw new ApiError("Invoice dibatalkan", 400);
    if (invoice.status === InvoiceStatus.DRAFT)
      throw new ApiError("Invoice draft tidak bisa dilunasi", 400);

    const updated = await this.prisma.invoice.updateMany({
      where: {
        id: invoiceId,
        status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE] },
      },
      data: {
        status: InvoiceStatus.PAID,
        method: data.method,
        paidAt: paidDate,
        paymentDate: paidDate,
      },
    });
    if (updated.count !== 1)
      throw new ApiError(
        "Status invoice telah berubah. Muat ulang halaman.",
        409,
      );
    const result = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    if (invoice.orderId) {
      try {
        await this.orderService.checkAndDeleteClientPoIfNeeded(invoice.orderId);
      } catch (error) {
        console.error("Gagal memeriksa PO client setelah pembayaran:", error);
      }
    }
    return result;
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

    if (query.search && query.search.trim() !== "") {
      const searchTerm = query.search.trim();
      where.OR = [
        { invoiceNumber: { contains: searchTerm } },
        {
          client: {
            b2b: { is: { companyName: { contains: searchTerm } } },
          },
        },
        {
          client: {
            b2c: { is: { name: { contains: searchTerm } } },
          },
        },
        { order: { is: { orderNumber: { contains: searchTerm } } } },
      ];
    }

    // 2. Filter Status & Kategori
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
          end.setDate(end.getDate() + 1);
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
          select: {
            orderNumber: true,
            currencyCode: true,
            salesCategory: true,
          },
        },
        _count: {
          select: { items: true },
        },
      },
    });

    const formattedData = invoices.map((inv) => {
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
        orderNumber: inv.order?.orderNumber || "-",
        clientName: clientName,
        category: inv.category,
        totalAmount: Number(inv.totalAmount),
        currencyCode: inv.order?.currencyCode || "IDR",
        status: inv.status,
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
        client: {
          include: {
            b2b: { include: { department: true, pics: true } },
            b2c: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            dateOrder: true,
            totalAmount: true,
            currencyCode: true,
            salesCategory: true,
            invoices: {
              select: {
                id: true,
                invoiceNumber: true,
                category: true,
                billingMode: true,
                status: true,
                totalAmount: true,
                paidAt: true,
                paymentDate: true,
                createdAt: true,
              },
              orderBy: { id: "asc" },
            },
            createdBy: {
              select: {
                name: true,
                phone: true,
                image: true,
              },
            },
          },
        },
        items: {
          include: {
            orderProduct: {
              select: {
                id: true,
                quantity: true,
                unitPrice: true,
              },
            },
            product: {
              select: {
                name: true,
                sku: true,
                materialType: true,
              },
            },
            variant: {
              select: {
                variantName: true,
                sku: true,
              },
            },
          },
        },
        notes: {
          include: { category: true },
        },
      },
    });

    if (!invoice) {
      throw new ApiError("Invoice not found", 404);
    }

    const allInvoices = invoice.order?.invoices ?? [];

    const activeInvoices = allInvoices.filter(
      (item) =>
        item.status !== InvoiceStatus.CANCELLED &&
        item.status !== InvoiceStatus.DRAFT,
    );

    const previousInvoices = activeInvoices.filter(
      (item) => item.id < invoice.id,
    );

    const previousInvoice = previousInvoices.at(-1) ?? null;

    const totalPreviouslyInvoiced = previousInvoices.reduce(
      (sum, item) => sum.plus(item.totalAmount),
      new Prisma.Decimal(0),
    );

    const totalPreviousPaid = previousInvoices
      .filter((item) => item.status === InvoiceStatus.PAID)
      .reduce((sum, item) => sum.plus(item.totalAmount), new Prisma.Decimal(0));

    const totalInvoiced = activeInvoices.reduce(
      (sum, item) => sum.plus(item.totalAmount),
      new Prisma.Decimal(0),
    );

    const totalPaid = activeInvoices
      .filter((item) => item.status === InvoiceStatus.PAID)
      .reduce((sum, item) => sum.plus(item.totalAmount), new Prisma.Decimal(0));

    const orderTotal = new Prisma.Decimal(
      invoice.order?.totalAmount ?? invoice.totalAmount,
    );

    return {
      ...invoice,
      previousInvoice,
      totalPreviousPaid: totalPreviousPaid.toNumber(),
      totalPreviouslyInvoiced: totalPreviouslyInvoiced.toNumber(),
      totalInvoiced: totalInvoiced.toNumber(),
      totalPaid: totalPaid.toNumber(),
      remainingToInvoice: Prisma.Decimal.max(
        orderTotal.minus(totalInvoiced),
        0,
      ).toNumber(),
      outstandingPayment: Prisma.Decimal.max(
        totalInvoiced.minus(totalPaid),
        0,
      ).toNumber(),
    };
  }

  async getMonthlyRevenueChart(month: number, year: number) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new ApiError("Bulan tidak valid", 400);
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ApiError("Tahun tidak valid", 400);
    }

    const wibOffset = 7 * 60 * 60 * 1000;

    const startDate = new Date(Date.UTC(year, month - 1, 1) - wibOffset);

    const endDate = new Date(Date.UTC(year, month, 1) - wibOffset);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.PAID,
        paidAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      select: {
        paidAt: true,
        totalAmount: true,
      },
    });

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const revenueByDay = new Map<number, number>();

    for (const invoice of invoices) {
      if (!invoice.paidAt) continue;

      const localDate = new Date(invoice.paidAt.getTime() + wibOffset);

      const day = localDate.getUTCDate();

      revenueByDay.set(
        day,
        (revenueByDay.get(day) || 0) + Number(invoice.totalAmount),
      );
    }

    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;

      const date = new Date(Date.UTC(year, month - 1, day));

      return {
        date: format(date, "dd MMM"),
        revenue: revenueByDay.get(day) || 0,
      };
    });
  }
}
