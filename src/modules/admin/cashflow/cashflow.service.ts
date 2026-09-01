import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { PrismaService } from "../../prisma/prisma.service";
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

    // 1. Filter Pencarian untuk Order & Replacement Order
    const orderWhere: Prisma.OrderWhereInput = {};
    const replacementWhere: Prisma.ReplacementOrderWhereInput = {};

    if (search) {
      const searchTerm = search.trim();
      // Filter untuk Order
      orderWhere.OR = [
        { orderNumber: { contains: searchTerm } },
        {
          client: {
            OR: [
              {
                b2b: {
                  companyName: { contains: searchTerm },
                },
              },
              { b2c: { name: { contains: searchTerm } } },
            ],
          },
        },
      ];
      // Filter untuk Replacement Order
      replacementWhere.OR = [
        { replacementNumber: { contains: searchTerm } },
        {
          client: {
            OR: [
              {
                b2b: {
                  companyName: { contains: searchTerm },
                },
              },
              { b2c: { name: { contains: searchTerm } } },
            ],
          },
        },
      ];
    }

    // Filter Tanggal
    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        dateFilter.lt = end;
      }
      orderWhere.dateOrder = dateFilter;
      replacementWhere.replacementDate = dateFilter;
    }

    // 2. Ambil data Order dan Replacement Order secara paralel
    const [orders, replacements] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere,
        include: {
          cashflowSummary: true,
          client: {
            select: {
              b2b: { select: { companyName: true } },
              b2c: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.replacementOrder.findMany({
        where: replacementWhere,
        include: {
          cashflowSummaries: true, // Relasi cashflow summary di replacement order
          client: {
            select: {
              b2b: { select: { companyName: true } },
              b2c: { select: { name: true } },
            },
          },
          referenceOrder: { select: { currencyCode: true } },
        },
      }),
    ]);

    // 3. Format dan Gabungkan Kedua Data Menjadi Satu Daftar (Unified List)
    let combinedData: any[] = [];

    // Mapping Order Biasa di Backend getAllCashflows
    orders.forEach((order) => {
      const summary = order.cashflowSummary[0];

      // Nilai Cashflow (sudah dalam IDR)
      const revenue = summary
        ? Number(summary.totalRevenue)
        : Number(order.totalAmount);
      const cost = summary ? Number(summary.totalCost) : 0;

      // Nilai murni asli dari order (misalnya 578 EUR)
      const originalRev = Number(order.totalAmount) || 0;
      // Jika cost asli ingin diambil dari data PO awal, bisa disesuaikan, atau 0 jika belum ada cost asli
      const originalCst = 0;

      let clientName = "-";
      if (order.client.b2b) clientName = order.client.b2b.companyName;
      else if (order.client.b2c) clientName = order.client.b2c.name;

      combinedData.push({
        id: summary?.id || order.id,
        referenceId: order.id,
        type: "order" as const,
        dateOrder: order.dateOrder,
        orderNumber: order.orderNumber,
        salesCategory: order.salesCategory,

        currencyCode: summary ? "IDR" : order.currencyCode,
        originalCurrencyCode: order.currencyCode,

        // Kirim nilai murni asli
        originalRevenue: originalRev,
        originalCost: originalCst,
        originalProfitOrLoss: originalRev - originalCst,

        clientName: clientName,
        totalRevenue: revenue,
        totalCost: cost,
        profitOrLoss: revenue - cost,
        hasCashflowData: !!summary,
      });
    });
    // Mapping Replacement Order di Backend getAllCashflows
    replacements.forEach((rep) => {
      const summary = rep.cashflowSummaries[0];
      const revenue = summary ? Number(summary.totalRevenue) : 0;
      const cost = summary ? Number(summary.totalCost) : 0;

      let clientName = "-";
      if (rep.client.b2b) clientName = rep.client.b2b.companyName;
      else if (rep.client.b2c) clientName = rep.client.b2c.name;

      const origCurr = rep.referenceOrder?.currencyCode || "IDR";

      combinedData.push({
        id: summary?.id || rep.id,
        referenceId: rep.id,
        type: "replacement" as const,
        dateOrder: rep.replacementDate,
        orderNumber: rep.replacementNumber || "RN-UNKNOWN",
        salesCategory: "REPLACEMENT",

        currencyCode: summary ? "IDR" : origCurr,
        originalCurrencyCode: origCurr,
        originalRevenue: revenue,

        clientName: clientName,
        totalRevenue: revenue,
        totalCost: cost,
        profitOrLoss: revenue - cost,
        hasCashflowData: !!summary,
      });
    });
    // 4. Urutkan Berdasarkan Tanggal Terbaru (Descending)
    combinedData.sort(
      (a, b) =>
        new Date(b.dateOrder).getTime() - new Date(a.dateOrder).getTime(),
    );

    // 5. Terapkan Paginasi Manual pada Data Gabungan
    const total = combinedData.length;
    const paginatedData = combinedData.slice(skip, skip + Number(take));

    return {
      data: paginatedData,
      meta: {
        page: Number(page),
        take: Number(take),
        total,
        totalPage: Math.ceil(total / Number(take)) || 1,
      },
    };
  }

  async saveCashflow(data: SaveCashflowDTO) {
    // 1. Ekstrak data dari DTO
    const { orderId, replacementOrderId, revenueItems, costItems } = data;

    // 2. Kalkulasi Total Keseluruhan
    const totalRevenue = revenueItems.reduce(
      (acc, item) =>
        acc + item.unitPrice * item.quantity * (item.exchangeRate || 1),
      0,
    );
    const totalCost = costItems.reduce(
      (acc, item) =>
        acc + item.costPerUnit * item.quantity * (item.exchangeRate || 1),
      0,
    );
    const profitLoss = totalRevenue - totalCost;

    let targetOrderNumber = data.orderNumber || "";
    let baseCurrencyCode = "IDR";

    // 3. Logika Pemilihan Sumber (Order vs Replacement Order) untuk mendapatkan base currency
    if (orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { orderNumber: true, currencyCode: true },
      });
      if (!order) throw new ApiError("Order tidak ditemukan", 404);

      targetOrderNumber = order.orderNumber || targetOrderNumber;
      baseCurrencyCode = order.currencyCode;
    } else if (replacementOrderId) {
      const replacement = await this.prisma.replacementOrder.findUnique({
        where: { id: replacementOrderId },
        include: {
          referenceOrder: { select: { orderNumber: true, currencyCode: true } },
        },
      });
      if (!replacement)
        throw new ApiError("Replacement Order tidak ditemukan", 404);

      targetOrderNumber =
        replacement.replacementNumber ||
        replacement.referenceOrder?.orderNumber ||
        targetOrderNumber;
      baseCurrencyCode = replacement.referenceOrder?.currencyCode || "IDR";
    }

    // 4. Transaksi Database (Menyimpan Summary & Items dengan Aman)
    const result = await this.prisma.$transaction(async (tx) => {
      // Cari summary yang sudah ada (berdasarkan orderId ATAU replacementOrderId)
      const existingSummary = await tx.cashflowSummary.findFirst({
        where: orderId ? { orderId } : { replacementOrderId },
      });

      //  PENGAMANAN (LOCKING): Cek apakah data sudah disetujui (APPROVED)
      if (existingSummary && existingSummary.status === "APPROVED") {
        throw new ApiError(
          "Data cashflow ini sudah disetujui dan tidak dapat diubah!",
          403,
        );
      }

      let summaryId = existingSummary?.id;

      if (existingSummary) {
        // A. Update Header Cashflow Summary
        await tx.cashflowSummary.update({
          where: { id: summaryId },
          data: {
            totalRevenue,
            totalCost,
            profitLoss,
            orderNumber: targetOrderNumber,
            baseCurrencyId: baseCurrencyCode,
          },
        });

        // Bersihkan item lama sebelum memasukkan yang baru
        await tx.cashflowRevenue.deleteMany({
          where: { cashflowId: summaryId },
        });
        await tx.cashflowCost.deleteMany({ where: { cashflowId: summaryId } });
      } else {
        // B. Buat Header Cashflow Summary Baru
        const newSummary = await tx.cashflowSummary.create({
          data: {
            orderId: orderId || null,
            replacementOrderId: replacementOrderId || null,
            orderNumber: targetOrderNumber,
            totalRevenue,
            totalCost,
            profitLoss,
            baseCurrencyId: baseCurrencyCode,
            status: "DRAFT", // Status awal selalu DRAFT
          },
        });
        summaryId = newSummary.id;
      }

      // C. Masukkan Revenue Items (Dilengkapi Historical Exchange Rate)
      if (revenueItems.length > 0) {
        await tx.cashflowRevenue.createMany({
          data: revenueItems.map((item) => {
            const currentRate = item.exchangeRate || 1;
            return {
              cashflowId: summaryId!,
              description: item.description,
              productId: item.productId || null,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              total: item.unitPrice * item.quantity * currentRate,
              currency: item.currency || baseCurrencyCode,
              exchangeRate: currentRate,
              historicalExchangeRate: currentRate,
              currencyCode: item.currency || baseCurrencyCode,
            };
          }),
        });
      }

      // D. Masukkan Cost Items (Dilengkapi Historical Exchange Rate)
      if (costItems.length > 0) {
        await tx.cashflowCost.createMany({
          data: costItems.map((item) => {
            const currentRate = item.exchangeRate || 1;
            return {
              cashflowId: summaryId!,
              description: item.description,
              vendorId: item.isManual ? null : item.vendorId,
              costPerUnit: item.costPerUnit,
              quantity: item.quantity,
              total: item.costPerUnit * item.quantity * currentRate,
              currency: item.currency || baseCurrencyCode,
              exchangeRate: currentRate,
              historicalExchangeRate: currentRate,
              currencyCode: item.currency || baseCurrencyCode,
            };
          }),
        });
      }

      return { summaryId, profitLoss };
    });

    return result;
  }

  async getCashflowDetail(query: {
    orderId?: string;
    replacementOrderId?: string;
  }) {
    const { orderId, replacementOrderId } = query;

    let targetOrderNumber = "";
    let baseCurrencyCode = "IDR";
    let initialTotalRevenue = 0;
    let initialProducts: any[] = [];
    let referenceId = "";

    if (orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          products: { include: { product: true, variant: true } },
        },
      });
      if (!order) throw new ApiError("Order tidak ditemukan", 404);

      targetOrderNumber = order.orderNumber || "";
      baseCurrencyCode = order.currencyCode;
      initialTotalRevenue = Number(order.totalAmount);
      initialProducts = order.products;
      referenceId = order.id;
    } else if (replacementOrderId) {
      const replacement = await this.prisma.replacementOrder.findUnique({
        where: { id: replacementOrderId },
        include: {
          referenceOrder: true,
          items: { include: { product: true, variant: true } },
        },
      });
      if (!replacement)
        throw new ApiError("Replacement Order tidak ditemukan", 404);

      targetOrderNumber =
        replacement.replacementNumber ||
        replacement.referenceOrder?.orderNumber ||
        "";
      baseCurrencyCode = replacement.referenceOrder?.currencyCode || "IDR";
      initialTotalRevenue = 0;
      initialProducts = replacement.items;
      referenceId = replacement.id;
    }

    // 2. AMBIL SEMUA VENDOR (Untuk Dropdown pilihan manual)
    const vendors = await this.prisma.vendor.findMany({
      where: { isActive: true },
      include: {
        vendorItems: { include: { item: true } },
        productItemCategories: { include: { itemCategory: true } },
      },
      orderBy: { companyName: "asc" },
    });

    const allVendors = vendors.map((v) => {
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

    //  3. AMBIL VENDOR KHUSUS DARI PO (Untuk Auto-fill Cashflow Cost)
    // Tidak perlu pakai if (orderId) lagi karena fungsi ini sudah dirancang untuk menangani keduanya.
    const poVendors = await this.getPOItemsForCashflow(
      orderId,
      replacementOrderId,
    );
    // Catatan: Jika ini replacementOrderId, poVendors akan tetap [] (kosong)
    // karena saat ini Replacement tidak memiliki PO di database.

    // 4. CARI CASHFLOW SUMMARY YANG SUDAH ADA
    const existingSummary = await this.prisma.cashflowSummary.findFirst({
      where: orderId ? { orderId } : { replacementOrderId },
      include: {
        revenues: { include: { product: true } },
        costs: { include: { vendor: true } },
      },
    });

    // A. JIKA SUDAH ADA (Mode Edit)
    if (existingSummary) {
      return {
        mode: "EDIT",
        summary: existingSummary,
        availableVendors: allVendors, // Untuk dropdown
        poVendors: poVendors, // Untuk info frontend jika dibutuhkan
        revenues: existingSummary.revenues.map((r) => ({
          ...r,
          unitPrice: Number(r.unitPrice),
          total: Number(r.total),
          exchangeRate: Number(r.exchangeRate),
          currency: r.currencyCode || r.currency || baseCurrencyCode,
        })),
        costs: existingSummary.costs.map((c) => ({
          ...c,
          costPerUnit: Number(c.costPerUnit),
          total: Number(c.total),
          exchangeRate: Number(c.exchangeRate),
          currency: c.currencyCode || c.currency || baseCurrencyCode,
        })),
      };
    }

    // B. JIKA BELUM ADA (Mode Create / Auto-Populate)
    const initialRevenues = initialProducts.map((p) => {
      const productName = p.product.name;
      const variantName = p.variant ? ` - ${p.variant.variantName}` : "";

      return {
        description: `${productName}${variantName}`,
        productId: p.productId,
        unitPrice: Number(p.unitPrice) || 0,
        quantity: p.quantity,
        total: (Number(p.unitPrice) || 0) * p.quantity,
        currency: baseCurrencyCode,
        exchangeRate: 1,
      };
    });

    return {
      mode: "CREATE",
      summary: {
        orderId: orderId || null,
        replacementOrderId: replacementOrderId || null,
        orderNumber: targetOrderNumber,
        totalRevenue: initialTotalRevenue,
        totalCost: 0,
        profitLoss: initialTotalRevenue,
        baseCurrencyId: baseCurrencyCode,
      },
      availableVendors: allVendors, // Semua vendor untuk dropdown manual
      poVendors: poVendors, // HANYA vendor dari PO untuk Auto-fill
      revenues: initialRevenues,
      costs: [],
    };
  }

  // ====================================================================
  // GET VENDORS LINKED TO AN ORDER (VIA PURCHASE ORDERS)
  // ====================================================================
  async getVendorsByOrderId(orderId: string) {
    const poItems = await this.prisma.purchaseOrderItem.findMany({
      where: { orderId: orderId },
      include: {
        purchaseOrder: {
          include: {
            vendor: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
      },
    });

    const uniqueVendorsMap = new Map();

    poItems.forEach((item) => {
      const vendor = item.purchaseOrder?.vendor;
      if (vendor && !uniqueVendorsMap.has(vendor.id)) {
        uniqueVendorsMap.set(vendor.id, vendor);
      }
    });
    const vendorsList = Array.from(uniqueVendorsMap.values());

    return vendorsList;
  }

  // ====================================================================
  // GET PO ITEMS LINKED TO AN ORDER ATAU REPLACEMENT ORDER (UNTUK CASHFLOW)
  // ====================================================================
  async getPOItemsForCashflow(orderId?: string, replacementOrderId?: string) {
    if (!orderId && !replacementOrderId) return [];

    const poItems = await this.prisma.purchaseOrderItem.findMany({
      where: {
        ...(orderId ? { orderId } : {}),
        ...(replacementOrderId ? { replacementOrderId } : {}),
      },
      include: {
        purchaseOrder: {
          select: {
            vendorId: true,
            currencyCode: true,
            vendor: {
              select: {
                companyName: true,
              },
            },
          },
        },
      },
    });

    return poItems.map((item) => ({
      vendorId: item.purchaseOrder?.vendorId,
      companyName: item.purchaseOrder?.vendor?.companyName,
      itemName: item.itemName,
      unitPrice: Number(item.unitPrice),
      quantityPurchase: item.quantityPurchase,
      currencyCode: item.purchaseOrder?.currencyCode,
    }));
  }
}
