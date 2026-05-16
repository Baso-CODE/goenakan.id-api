import { OrderStatus, TransactionType } from "@prisma/client";
import { injectable } from "tsyringe";
import { PrismaService } from "../prisma/prisma.service";
import {
  AnalyticsFilterQuery,
  calculateDateRange,
  getDateKey,
  getDateSortKey,
  getRangeDays,
  round,
} from "./analytics.helper";

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

interface RegionData {
  id: string;
  region: string;
  totalCustomerSet: Set<string>;
  totalSales: number;
  lastOrder: Date;
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
  };
  regionData: Array<{
    id: string;
    region: string;
    totalCustomer: number;
    totalSales: number;
    lastOrder: string;
  }>;
  period: { start: Date; end: Date };
}

const UNKNOWN_REGION = "Unknown Region";

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

    // 1. Tarik orders di period dengan data client
    const orders = await this.prisma.order.findMany({
      where: {
        dateOrder: { gte: start, lte: end },
        status: { not: OrderStatus.CANCELLED },
      },
      select: {
        id: true,
        clientId: true,
        dateOrder: true,
        totalAmount: true,
        client: {
          select: {
            type: true,
            b2b: { select: { city: true, province: true } },
            b2c: { select: { city: true, province: true } },
          },
        },
      },
      // Secondary sort by id untuk deterministic order saat dateOrder sama
      orderBy: [{ dateOrder: "asc" }, { id: "asc" }],
    });

    // Early return kalau tidak ada data
    if (orders.length === 0) {
      return this.buildEmptyResult(range);
    }

    // 2. Cari first order ID untuk setiap client (ALL TIME, bukan cuma di range)
    const clientIds = Array.from(
      new Set(orders.map((o) => o.clientId).filter((id): id is string => !!id)),
    );

    const firstOrders = await this.prisma.order.findMany({
      where: {
        clientId: { in: clientIds },
        status: { not: OrderStatus.CANCELLED },
      },
      select: { id: true, clientId: true, dateOrder: true },
      orderBy: [{ dateOrder: "asc" }, { id: "asc" }],
    });

    const firstOrderIdByClient = new Map<string, string>();
    for (const o of firstOrders) {
      if (o.clientId && !firstOrderIdByClient.has(o.clientId)) {
        firstOrderIdByClient.set(o.clientId, o.id);
      }
    }

    // 3. Penampung hasil
    let totalRevenue = 0;
    const newCustomers = new Set<string>();
    const returningCustomers = new Set<string>();
    const uniqueCustomers = new Set<string>();
    const monthlyMap = new Map<string, MonthlyComparisonData>();
    const regionMap = new Map<string, RegionData>();

    // 4. Iterasi orders
    for (const order of orders) {
      if (!order.clientId || !order.client) continue;

      const orderRevenue = Number(order.totalAmount || 0);
      totalRevenue += orderRevenue;
      uniqueCustomers.add(order.clientId);

      const isFirstOrder =
        firstOrderIdByClient.get(order.clientId) === order.id;

      if (isFirstOrder) {
        newCustomers.add(order.clientId);
      } else {
        returningCustomers.add(order.clientId);
      }

      // Monthly grouping
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
        monthData.newOrderCount++;
        monthData.newSales += orderRevenue;
      } else {
        monthData.repeatOrderCount++;
        monthData.repeatSales += orderRevenue;
      }

      // Region grouping
      const regionName = this.resolveRegionName(order.client);

      if (!regionMap.has(regionName)) {
        regionMap.set(regionName, {
          id: regionName,
          region: regionName,
          totalCustomerSet: new Set<string>(),
          totalSales: 0,
          lastOrder: order.dateOrder,
        });
      }
      const regData = regionMap.get(regionName)!;
      regData.totalCustomerSet.add(order.clientId);
      regData.totalSales += orderRevenue;
      if (order.dateOrder > regData.lastOrder) {
        regData.lastOrder = order.dateOrder;
      }
    }

    // 5. CLV
    const totalUnique = uniqueCustomers.size;
    const clv = totalUnique > 0 ? totalRevenue / totalUnique : 0;

    // 6. CAC
    const { cac, totalMarketingCost } = await this.calculateCAC(
      start,
      end,
      newCustomers.size,
    );

    // 7. Build graphs
    const sortedMonthly = Array.from(monthlyMap.values()).sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey),
    );

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

    const retentionGraph = sortedMonthly.map((data) => {
      const totalOrders = data.newOrderCount + data.repeatOrderCount;
      const repeatRate =
        totalOrders > 0 ? (data.repeatOrderCount / totalOrders) * 100 : 0;
      return {
        label: data.dateKey,
        repeatRate: round(repeatRate, 1),
        churnRate: null, // TODO: cohort analysis
      };
    });

    const regionDataArray = Array.from(regionMap.values())
      .map((r) => ({
        id: r.id,
        region: r.region,
        totalCustomer: r.totalCustomerSet.size,
        totalSales: r.totalSales,
        lastOrder: r.lastOrder.toISOString(),
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

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
      },
      regionData: regionDataArray,
      period: { start, end },
    };
  }

  // =======================================================================
  // HELPER: Resolve region name dari client data
  // Format: "City, Province" jika dua-duanya ada
  // =======================================================================
  private resolveRegionName(client: {
    type: string;
    b2b: { city: string | null; province: string | null } | null;
    b2c: { city: string | null; province: string | null } | null;
  }): string {
    const source = client.type === "B2B" ? client.b2b : client.b2c;
    if (!source) return UNKNOWN_REGION;

    const city = source.city?.trim();
    const province = source.province?.trim();

    if (city && province) return `${city}, ${province}`;
    if (city) return city;
    if (province) return province;
    return UNKNOWN_REGION;
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
      },
      regionData: [],
      period: range,
    };
  }
}
