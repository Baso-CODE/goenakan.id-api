import { OrderStatus } from "@prisma/client";
import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AnalyticsFilterQuery,
  calculateDateRange,
  getDateKey,
  getDateSortKey,
  getRangeDays,
  incrementMap,
  mapToNameValueArray,
} from "./analytics.helper";

// =========================================================================
// TYPE DEFINITIONS
// =========================================================================

interface TrendDataPoint {
  dateKey: string;
  sortKey: string;
  revenue: number;
  orderCount: number;
  profit: number;
  categories: Record<string, number>; // pakai nested object, bukan flatten
}

interface ProductSalesStat {
  sku: string;
  name: string;
  totalQuantity: number;
  totalRevenue: number;
}

interface SalesOverviewResult {
  metrics: {
    revenue: number;
    orders: number;
    averagePurchase: number;
    profit: number | null;
  };
  graphs: {
    trend: Array<{
      label: string;
      revenue: number;
      order: number;
      profit: number;
      categories: Record<string, number>;
    }>;
  };
  pieCharts: {
    productCategories: Array<{ name: string; value: number }>;
    itemCategories: Record<string, Array<{ name: string; value: number }>>;
  };
  productsPerformance: {
    top: ProductSalesStat[];
    bottom: ProductSalesStat[];
  };
  period: { start: Date; end: Date };
}

// =========================================================================
// SERVICE
// =========================================================================

@injectable()
export class SalesOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getSalesOverview(
    query: AnalyticsFilterQuery,
  ): Promise<SalesOverviewResult> {
    const range = calculateDateRange(query);
    const { start, end } = range;
    const rangeDays = getRangeDays(range);

    // Tarik orders dengan select spesifik (lebih ringan dari include 3 level)
    const orders = await this.prisma.order.findMany({
      where: {
        dateOrder: { gte: start, lte: end },
        status: { not: OrderStatus.CANCELLED },
      },
      select: {
        id: true,
        dateOrder: true,
        totalAmount: true,
        products: {
          select: {
            quantity: true,
            unitPrice: true,
            product: {
              select: {
                name: true,
                sku: true,
                category: { select: { name_id: true } },
                itemCategory: { select: { name: true } },
              },
            },
          },
        },
        cashflowSummary: {
          select: { profitLoss: true },
        },
      },
      orderBy: { dateOrder: "asc" },
    });

    // Penampung hasil
    let totalRevenue = 0;
    let totalProfit = 0;
    let hasProfitData = false; // flag apakah ada data cashflowSummary

    const trendMap = new Map<string, TrendDataPoint>();
    const categoryMap = new Map<string, number>();
    const itemMapGlobal = new Map<string, number>();
    const itemMapNested = new Map<string, Map<string, number>>();
    const productSalesMap = new Map<string, ProductSalesStat>();

    // Iterasi orders
    for (const order of orders) {
      const orderRevenue = Number(order.totalAmount);
      totalRevenue += orderRevenue;

      // PROFIT dari cashflowSummary (bukan hardcoded 0)
      let orderProfit = 0;
      if (order.cashflowSummary && order.cashflowSummary.length > 0) {
        hasProfitData = true;
        orderProfit = order.cashflowSummary.reduce(
          (sum, cs) => sum + Number(cs.profitLoss),
          0,
        );
      }
      totalProfit += orderProfit;

      // Date key dengan tahun (fix collision lintas tahun)
      const dateKey = getDateKey(order.dateOrder, rangeDays);
      const sortKey = getDateSortKey(order.dateOrder, rangeDays);

      if (!trendMap.has(dateKey)) {
        trendMap.set(dateKey, {
          dateKey,
          sortKey,
          revenue: 0,
          orderCount: 0,
          profit: 0,
          categories: {},
        });
      }
      const trendData = trendMap.get(dateKey)!;
      trendData.revenue += orderRevenue;
      trendData.orderCount += 1;
      trendData.profit += orderProfit;

      // Iterasi products dalam order
      for (const item of order.products) {
        const itemRevenue = Number(item.unitPrice) * item.quantity;
        const categoryName = item.product?.category?.name_id || "Uncategorized";
        const itemCatName = item.product?.itemCategory?.name || "Uncategorized";

        // A. Akumulasi Product Category
        incrementMap(categoryMap, categoryName, itemRevenue);

        // B. Item Category - Global (All)
        incrementMap(itemMapGlobal, itemCatName, itemRevenue);

        // C. Item Category - Per Product Category (nested)
        if (!itemMapNested.has(categoryName)) {
          itemMapNested.set(categoryName, new Map<string, number>());
        }
        incrementMap(
          itemMapNested.get(categoryName)!,
          itemCatName,
          itemRevenue,
        );

        // D. Stacked bar - simpan di nested object 'categories' (no collision)
        trendData.categories[categoryName] =
          (trendData.categories[categoryName] || 0) + itemRevenue;

        // E. Top/Bottom Products
        const productName = item.product?.name || "Unknown Product";
        const productSku = item.product?.sku || "NO-SKU";

        if (!productSalesMap.has(productSku)) {
          productSalesMap.set(productSku, {
            sku: productSku,
            name: productName,
            totalQuantity: 0,
            totalRevenue: 0,
          });
        }
        const productStats = productSalesMap.get(productSku)!;
        productStats.totalQuantity += item.quantity;
        productStats.totalRevenue += itemRevenue;
      }
    }

    // Sort trend chronologically by sortKey
    const trendGraphData = Array.from(trendMap.values())
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map((t) => ({
        label: t.dateKey,
        revenue: t.revenue,
        order: t.orderCount,
        profit: t.profit,
        categories: t.categories,
      }));

    // Pie charts
    const categoryPieData = mapToNameValueArray(categoryMap);
    const itemCategoriesData: Record<
      string,
      Array<{ name: string; value: number }>
    > = {
      all: mapToNameValueArray(itemMapGlobal),
    };
    for (const [catName, itemsMap] of itemMapNested.entries()) {
      itemCategoriesData[catName] = mapToNameValueArray(itemsMap);
    }

    // Top & Bottom products
    const allProducts = Array.from(productSalesMap.values()).sort(
      (a, b) => b.totalQuantity - a.totalQuantity,
    );
    const top5 = allProducts.slice(0, 5);
    const bottom5 =
      allProducts.length > 5 ? allProducts.slice(-5).reverse() : [];

    return {
      metrics: {
        revenue: totalRevenue,
        orders: orders.length,
        averagePurchase: orders.length > 0 ? totalRevenue / orders.length : 0,
        // null jika sama sekali tidak ada cashflowSummary di period ini
        profit: hasProfitData ? totalProfit : null,
      },
      graphs: { trend: trendGraphData },
      pieCharts: {
        productCategories: categoryPieData,
        itemCategories: itemCategoriesData,
      },
      productsPerformance: {
        top: top5,
        bottom: bottom5,
      },
      period: { start, end },
    };
  }
}
