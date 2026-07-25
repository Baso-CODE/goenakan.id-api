import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { SaveCashflowDTO } from "./dto/cashflow.dto";

@injectable()
export class CashflowService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllCashflows(query: {
    page?: number;
    take?: number;
    search?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page = 1, take = 10, search, startDate, endDate } = query;
    const skip = (Number(page) - 1) * Number(take);

    // 1. Build Query Condition
    const where: Prisma.OrderWhereInput = {};

    if (search) {
      where.orderNumber = { contains: search };
    }

    // Filter Date Range
    if (startDate || endDate) {
      where.dateOrder = {};
      if (startDate) where.dateOrder.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.dateOrder.lt = end;
      }
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: Number(take),
        orderBy: { dateOrder: "desc" },
        include: {
          cashflowSummary: true,
          client: {
            select: {
              type: true,
              b2b: { select: { companyName: true } },
              b2c: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const data = orders.map((order) => {
      const summary = order.cashflowSummary[0];

      const revenue = summary
        ? Number(summary.totalRevenue)
        : Number(order.totalAmount);

      const cost = summary ? Number(summary.totalCost) : 0;
      const profit = revenue - cost;

      // Nama Client Flattening
      let clientName = "-";
      if (order.client.b2b) clientName = order.client.b2b.companyName;
      else if (order.client.b2c) clientName = order.client.b2c.name;

      return {
        orderId: order.id,
        dateOrder: order.dateOrder,
        orderNumber: order.orderNumber,
        salesCategory: order.salesCategory,
        currencyCode: order.currencyCode,
        clientName: clientName,
        totalRevenue: revenue,
        totalCost: cost,
        profitOrLoss: profit,
        hasCashflowData: !!summary,
      };
    });

    return {
      data,
      meta: {
        page: Number(page),
        take: Number(take),
        total,
        totalPage: Math.ceil(total / Number(take)),
      },
    };
  }

  async getCashflowDetail(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        products: {
          include: { product: true, variant: true },
        },
      },
    });

    if (!order) {
      throw new ApiError("Order tidak ditemukan", 404);
    }

    const vendors = await this.prisma.vendor.findMany({
      where: { isActive: true },
      include: {
        vendorItems: {
          include: { item: true },
        },
        productItemCategories: {
          include: { itemCategory: true },
        },
      },
      orderBy: { companyName: "asc" },
    });

    const availableVendors = vendors.map((v) => {
      let items: { id: string; name: string }[] = [];

      if (v.type === "SERVICE") {
        items = v.vendorItems.map((vi) => ({
          id: vi.item.id,
          name: vi.item.name,
        }));
      } else if (v.type === "PRODUCT") {
        items = v.productItemCategories.map((pic) => ({
          id: pic.itemCategory.id,
          name: pic.itemCategory.name,
        }));
      }

      return {
        id: v.id,
        companyName: v.companyName,
        type: v.type,
        items: items,
      };
    });

    const existingSummary = await this.prisma.cashflowSummary.findFirst({
      where: { orderId },
      include: {
        revenues: { include: { product: true } },
        costs: { include: { vendor: true } },
      },
    });

    if (existingSummary) {
      return {
        mode: "EDIT",
        summary: existingSummary,
        availableVendors,
        revenues: existingSummary.revenues.map((r) => ({
          ...r,
          unitPrice: Number(r.unitPrice),
          total: Number(r.total),
          exchangeRate: Number(r.exchangeRate),
          currency: r.currencyCode || r.currency || order.currencyCode,
        })),
        costs: existingSummary.costs.map((c) => ({
          ...c,
          costPerUnit: Number(c.costPerUnit),
          total: Number(c.total),
          exchangeRate: Number(c.exchangeRate),
          currency: c.currencyCode || c.currency || order.currencyCode,
        })),
      };
    }

    // B. Jika BELUM ADA (Create Mode / Auto-Populate)
    const initialRevenues = order.products.map((p) => {
      const productName = p.product.name;
      const variantName = p.variant ? ` - ${p.variant.variantName}` : "";

      return {
        description: `${productName}${variantName}`,
        productId: p.productId,
        unitPrice: Number(p.unitPrice),
        quantity: p.quantity,
        total: Number(p.unitPrice) * p.quantity,
        currency: order.currencyCode,
        exchangeRate: 1,
      };
    });

    return {
      mode: "CREATE",
      summary: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalRevenue: Number(order.totalAmount),
        totalCost: 0,
        profitLoss: Number(order.totalAmount),
        baseCurrencyId: order.currencyCode,
      },
      availableVendors, // 👈 Sertakan list vendor di sini juga
      revenues: initialRevenues,
      costs: [],
    };
  }

  async saveCashflow(orderId: string, data: SaveCashflowDTO) {
    const { revenueItems, costItems, orderNumber } = data;

    const totalRevenue = revenueItems.reduce(
      (acc, item) => acc + item.total,
      0,
    );
    const totalCost = costItems.reduce((acc, item) => acc + item.total, 0);
    const profitLoss = totalRevenue - totalCost;

    // 1. Ambil order untuk memastikan orderNumber terbaru DAN currencyCode
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        currencyCode: true,
      },
    });

    if (!order) throw new ApiError("Order tidak ditemukan", 404);

    const result = await this.prisma.$transaction(async (tx) => {
      // A. Cek Summary Lama
      const existingSummary = await tx.cashflowSummary.findFirst({
        where: { orderId },
      });

      let summaryId = existingSummary?.id;

      if (existingSummary) {
        // Update Header
        await tx.cashflowSummary.update({
          where: { id: summaryId },
          data: {
            totalRevenue,
            totalCost,
            profitLoss,
            orderNumber: order.orderNumber!,
            baseCurrencyId: order.currencyCode,
          },
        });

        await tx.cashflowRevenue.deleteMany({
          where: { cashflowId: summaryId },
        });
        await tx.cashflowCost.deleteMany({ where: { cashflowId: summaryId } });
      } else {
        // Create Baru
        const newSummary = await tx.cashflowSummary.create({
          data: {
            orderId,
            orderNumber: order.orderNumber!,
            totalRevenue,
            totalCost,
            profitLoss,
            baseCurrencyId: order.currencyCode,
          },
        });
        summaryId = newSummary.id;
      }

      // C. Insert Revenue Items
      if (revenueItems.length > 0) {
        await tx.cashflowRevenue.createMany({
          data: revenueItems.map((item) => ({
            cashflowId: summaryId!,
            description: item.description,
            productId: item.productId || null,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            total: item.total,
            currency: item.currency,
            exchangeRate: item.exchangeRate,
            currencyCode: item.currency,
          })),
        });
      }

      // D. Insert Cost Items
      if (costItems.length > 0) {
        await tx.cashflowCost.createMany({
          data: costItems.map((item) => ({
            cashflowId: summaryId!,
            description: item.description,
            vendorId: item.vendorId || null,
            costPerUnit: item.costPerUnit,
            quantity: item.quantity,
            total: item.total,
            currency: item.currency,
            exchangeRate: item.exchangeRate,
            currencyCode: item.currency,
          })),
        });
      }

      return { summaryId, profitLoss };
    });

    return result;
  }
}
