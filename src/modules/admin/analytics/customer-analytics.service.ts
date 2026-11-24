import { OrderStatus, TransactionType } from "@prisma/client";
import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AnalyticsFilterQuery,
  calculateDateRange,
  getDateKey,
  getDateSortKey,
  getRangeDays,
  round,
} from "./analytics.helper";

import {
  buildCustomerBreakdown,
  type ChannelOrderChartData,
  type CustomerRegionRow,
} from "./customer-breakdown.helper";
// =========================================================================
// TYPE DEFINITIONS
// =========================================================================

interface MonthlyComparisonData {
  dateKey: string;
  sortKey: string;
  newOrderCount: number;
  repeatOrderCount: number;
  newSales: number;
  repeatSales: number;
}

interface CustomerAnalyticsResult {
  metrics: {
    newCustomer: number;
    returningCustomer: number;
    totalUniqueCustomer: number;
    clv: number;
    cac: number | null;
    totalMarketingCost: number | null;
  };

  graphs: {
    retention: Array<{
      label: string;
      repeatRate: number;
      churnRate: number | null;
    }>;

    comparison: Array<{
      label: string;
      newOrderPct: number;
      repeatOrderPct: number;
      avgSalesNew: number;
      avgSalesRepeat: number;
    }>;

    channelOrders: ChannelOrderChartData;
  };

  regionData: CustomerRegionRow[];

  period: {
    start: Date;
    end: Date;
  };
}

// =========================================================================
// SERVICE
// =========================================================================

@injectable()
export class CustomerAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCustomerAnalytics(
    query: AnalyticsFilterQuery,
  ): Promise<CustomerAnalyticsResult> {
    const range = calculateDateRange(query);
    const { start, end } = range;
    const rangeDays = getRangeDays(range);

    // ==========================================
    // 1. FETCH ORDERS WITH CLIENT & CHANNEL
    // ==========================================
    const orders = await this.prisma.order.findMany({
      where: {
        dateOrder: {
          gte: start,
          lte: end,
        },
        status: {
          not: OrderStatus.CANCELLED,
        },
      },

      select: {
        id: true,
        clientId: true,
        dateOrder: true,
        totalAmount: true,
        currencyCode: true,

        purchaseChannel: {
          select: {
            id: true,
            name: true,
          },
        },

        client: {
          select: {
            type: true,

            b2b: {
              select: {
                country: true,
                province: true,
                city: true,
              },
            },

            b2c: {
              select: {
                country: true,
                province: true,
                city: true,
              },
            },
          },
        },
      },

      orderBy: [{ dateOrder: "asc" }, { id: "asc" }],
    });

    // ==========================================
    // EARLY RETURN
    // ==========================================
    if (orders.length === 0) {
      return this.buildEmptyResult(range);
    }

    // ==========================================
    // 2. GET FIRST ORDER FOR EACH CUSTOMER
    // ==========================================
    // Mengambil first order berdasarkan seluruh
    // histori, bukan hanya periode filter.
    const clientIds = Array.from(
      new Set(
        orders
          .map((order) => order.clientId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const firstOrders = await this.prisma.order.findMany({
      where: {
        clientId: {
          in: clientIds,
        },
        status: {
          not: OrderStatus.CANCELLED,
        },
      },

      select: {
        id: true,
        clientId: true,
        dateOrder: true,
      },

      orderBy: [{ dateOrder: "asc" }, { id: "asc" }],
    });

    const firstOrderIdByClient = new Map<string, string>();

    for (const order of firstOrders) {
      if (order.clientId && !firstOrderIdByClient.has(order.clientId)) {
        firstOrderIdByClient.set(order.clientId, order.id);
      }
    }

    // ==========================================
    // 3. INITIALIZE ANALYTICS ACCUMULATORS
    // ==========================================
    let totalRevenue = 0;

    const newCustomers = new Set<string>();

    const returningCustomers = new Set<string>();

    const uniqueCustomers = new Set<string>();

    const monthlyMap = new Map<string, MonthlyComparisonData>();

    // ==========================================
    // 4. PROCESS CUSTOMER ORDERS
    // ==========================================
    for (const order of orders) {
      if (!order.clientId || !order.client) {
        continue;
      }

      const orderRevenue = Number(order.totalAmount || 0);

      totalRevenue += orderRevenue;

      uniqueCustomers.add(order.clientId);

      // ==========================================
      // NEW VS RETURNING CUSTOMER
      // ==========================================
      const isFirstOrder =
        firstOrderIdByClient.get(order.clientId) === order.id;

      if (isFirstOrder) {
        newCustomers.add(order.clientId);
      } else {
        returningCustomers.add(order.clientId);
      }

      // ==========================================
      // DATE GROUPING
      // ==========================================
      const dateKey = getDateKey(order.dateOrder, rangeDays);

      const sortKey = getDateSortKey(order.dateOrder, rangeDays);

      if (!monthlyMap.has(dateKey)) {
        monthlyMap.set(dateKey, {
          dateKey,
          sortKey,
          newOrderCount: 0,
          repeatOrderCount: 0,
          newSales: 0,
          repeatSales: 0,
        });
      }

      const monthData = monthlyMap.get(dateKey)!;

      if (isFirstOrder) {
        monthData.newOrderCount += 1;
        monthData.newSales += orderRevenue;
      } else {
        monthData.repeatOrderCount += 1;
        monthData.repeatSales += orderRevenue;
      }

      // Region dan Purchase Channel tidak lagi
      // dihitung di dalam loop ini.
      // Keduanya ditangani oleh
      // buildCustomerBreakdown().
    }

    // ==========================================
    // 5. CUSTOMER LIFETIME VALUE
    // ==========================================
    const totalUnique = uniqueCustomers.size;

    const clv = totalUnique > 0 ? totalRevenue / totalUnique : 0;

    // ==========================================
    // 6. CUSTOMER ACQUISITION COST
    // ==========================================
    const { cac, totalMarketingCost } = await this.calculateCAC(
      start,
      end,
      newCustomers.size,
    );

    // ==========================================
    // 7. SORT DATE GROUPS
    // ==========================================
    const sortedMonthly = Array.from(monthlyMap.values()).sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey),
    );

    // ==========================================
    // 8. NEW VS REPEAT CUSTOMER GRAPH
    // ==========================================
    const comparisonGraph = sortedMonthly.map((data) => {
      const totalOrders = data.newOrderCount + data.repeatOrderCount;

      const newPct =
        totalOrders > 0 ? (data.newOrderCount / totalOrders) * 100 : 0;

      const repeatPct =
        totalOrders > 0 ? (data.repeatOrderCount / totalOrders) * 100 : 0;

      const avgNew =
        data.newOrderCount > 0 ? data.newSales / data.newOrderCount : 0;

      const avgRepeat =
        data.repeatOrderCount > 0
          ? data.repeatSales / data.repeatOrderCount
          : 0;

      return {
        label: data.dateKey,
        newOrderPct: round(newPct, 1),
        repeatOrderPct: round(repeatPct, 1),
        avgSalesNew: Math.round(avgNew),
        avgSalesRepeat: Math.round(avgRepeat),
      };
    });

    // ==========================================
    // 9. CUSTOMER RETENTION GRAPH
    // ==========================================
    const retentionGraph = sortedMonthly.map((data) => {
      const totalOrders = data.newOrderCount + data.repeatOrderCount;

      const repeatRate =
        totalOrders > 0 ? (data.repeatOrderCount / totalOrders) * 100 : 0;

      return {
        label: data.dateKey,
        repeatRate: round(repeatRate, 1),

        // TODO: Implement cohort analysis.
        churnRate: null,
      };
    });

    // ==========================================
    // 10. CUSTOMER REGION & CHANNEL BREAKDOWN
    // ==========================================
    // Helper ini menangani:
    // - Country
    // - Region / Province
    // - City
    // - Total Unique Customer
    // - Total Sales by Currency
    // - Last Order
    // - Channel Order per Month
    // - Unassigned Purchase Channel
    // - Empty Month Buckets
    const breakdown = buildCustomerBreakdown(orders, range);

    // ==========================================
    // 11. FINAL RESPONSE
    // ==========================================
    return {
      metrics: {
        newCustomer: newCustomers.size,
        returningCustomer: returningCustomers.size,
        totalUniqueCustomer: totalUnique,
        clv,
        cac,
        totalMarketingCost,
      },

      graphs: {
        retention: retentionGraph,
        comparison: comparisonGraph,

        channelOrders: breakdown.channelOrders,
      },

      regionData: breakdown.regionData,

      period: {
        start,
        end,
      },
    };
  }

  // =======================================================================
  // CAC: pakai aggregate untuk efisiensi + flag isMarketing
  // =======================================================================
  private async calculateCAC(
    start: Date,
    end: Date,
    newCustomerCount: number,
  ): Promise<{ cac: number | null; totalMarketingCost: number | null }> {
    const result = await this.prisma.financeTransaction.aggregate({
      where: {
        transactionDate: { gte: start, lte: end },
        type: TransactionType.EXPENSE,
        category: { isMarketing: true },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    // Tidak ada data marketing sama sekali → return null untuk keduanya
    if (result._count._all === 0) {
      return { cac: null, totalMarketingCost: null };
    }

    const totalMarketingCost = Number(result._sum.amount || 0);

    // Ada cost marketing tapi tidak ada new customer
    // Return cost-nya untuk visibility, tapi CAC tidak bisa dihitung
    if (newCustomerCount === 0) {
      return { cac: null, totalMarketingCost };
    }

    return {
      cac: totalMarketingCost / newCustomerCount,
      totalMarketingCost,
    };
  }

  // =======================================================================
  // HELPER: Empty result struktur untuk konsistensi response
  // =======================================================================

  private buildEmptyResult(range: {
    start: Date;
    end: Date;
  }): CustomerAnalyticsResult {
    return {
      metrics: {
        newCustomer: 0,
        returningCustomer: 0,
        totalUniqueCustomer: 0,
        clv: 0,
        cac: null,
        totalMarketingCost: null,
      },

      graphs: {
        retention: [],
        comparison: [],

        channelOrders: buildCustomerBreakdown([], range).channelOrders,
      },

      regionData: [],

      period: range,
    };
  }
}
