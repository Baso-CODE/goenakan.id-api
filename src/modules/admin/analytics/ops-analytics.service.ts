import {
  OrderStatus,
  ProductionStatus,
  QuotationStatus,
  SalesCategory,
  ShipmentStatus,
} from "@prisma/client";
import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AnalyticsFilterQuery,
  calculateDateRange,
  getDateKey,
  getDateSortKey,
  getRangeDays,
  incrementMap,
  round,
} from "./analytics.helper";

// =========================================================================
// TYPE DEFINITIONS
// =========================================================================

interface OpsAnalyticsResult {
  logistics: {
    metrics: {
      production: number; // ProductionTracker IN_PRODUCTION
      packaging: number; // Shipment PREPARED
      shipping: number; // Shipment DISPATCHED
      sendToCustomer: number; // Shipment ARRIVED (belum complete)
      complete: number; // Order COMPLETED
    };
    averages: {
      avgProductionDays: number | null;
      avgShippingDays: number | null;
      avgFulfillmentDays: number | null;
    };
    lateDeliveries: {
      byMonth: Array<{ label: string; value: number }>;
      byVendor: Array<{ label: string; value: number }>;
      byProduct: Array<{ label: string; value: number }>;
    };
  };
  sample: {
    totalSample: number;
    totalCost: number | null;
    convertedCustomer: number;
    conversionRate: number;
    returnOfSample: number | null;
    avgFollowUpsBeforeConversion: number | null;
  };
  quotation: {
    draft: number;
    sent: number;
    followUp: number;
    accepted: number;
    rejected: number;
    expired: number;
    cancelled: number;
    avgLeadTimeDays: number | null;
    conversionRate: number; // accepted / sent
  };
  period: { start: Date; end: Date };
}

// =========================================================================
// SERVICE
// =========================================================================

@injectable()
export class OpsAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOpsAnalytics(
    query: AnalyticsFilterQuery,
  ): Promise<OpsAnalyticsResult> {
    const range = calculateDateRange(query);

    // Jalankan paralel untuk performa
    const [logistics, sample, quotation] = await Promise.all([
      this.getLogisticsData(range),
      this.getSampleData(range),
      this.getQuotationData(range),
    ]);

    return {
      logistics,
      sample,
      quotation,
      period: range,
    };
  }

  // =======================================================================
  // LOGISTICS
  // =======================================================================
  private async getLogisticsData(range: { start: Date; end: Date }) {
    const { start, end } = range;
    const rangeDays = getRangeDays(range);

    // 1. Pipeline counts dari sumber yang benar
    const [
      productionCount,
      packagingCount,
      shippingCount,
      sendToCustCount,
      completeCount,
    ] = await Promise.all([
      this.prisma.productionTracker.count({
        where: {
          status: ProductionStatus.IN_PRODUCTION,
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.shipment.count({
        where: {
          status: ShipmentStatus.PREPARED,
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.shipment.count({
        where: {
          status: ShipmentStatus.DISPATCHED,
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.shipment.count({
        where: {
          status: ShipmentStatus.ARRIVED,
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.order.count({
        where: {
          status: OrderStatus.COMPLETED,
          dateOrder: { gte: start, lte: end },
        },
      }),
    ]);

    // 2. Average days dari data asli
    const completedProductions = await this.prisma.productionTracker.findMany({
      where: {
        status: ProductionStatus.COMPLETED,
        startDate: { not: null },
        endDate: { not: null, gte: start, lte: end },
      },
      select: { startDate: true, endDate: true },
    });

    const avgProductionDays = this.calculateAvgDays(
      completedProductions.map((p) => ({
        start: p.startDate!,
        end: p.endDate!,
      })),
    );

    const arrivedShipments = await this.prisma.shipment.findMany({
      where: {
        status: ShipmentStatus.ARRIVED,
        departureDate: { not: null },
        arrivalDate: { not: null, gte: start, lte: end },
      },
      select: { departureDate: true, arrivalDate: true },
    });

    const avgShippingDays = this.calculateAvgDays(
      arrivedShipments.map((s) => ({
        start: s.departureDate!,
        end: s.arrivalDate!,
      })),
    );

    // Fulfillment = dari order dibuat sampai shipment arrived
    const fulfillmentData = await this.prisma.shipment.findMany({
      where: {
        status: ShipmentStatus.ARRIVED,
        arrivalDate: { not: null, gte: start, lte: end },
      },
      select: {
        arrivalDate: true,
        order: { select: { dateOrder: true } },
      },
    });

    const avgFulfillmentDays = this.calculateAvgDays(
      fulfillmentData
        .filter((f) => f.order?.dateOrder && f.arrivalDate)
        .map((f) => ({
          start: f.order!.dateOrder,
          end: f.arrivalDate!,
        })),
    );

    // 3. Late deliveries dari ProductionTracker
    // CATATAN: Skema saat ini belum punya field targetDate/deadline.
    // Setelah schema diupdate dengan field `targetEndDate` di ProductionTracker,
    // logic di bawah akan otomatis bekerja. Sementara return empty array.
    const lateProductions: Array<{
      endDate: Date | null;
      order: { dateOrder: Date } | null;
      orderProduct: { product: { name: string } | null } | null;
      vendor: { companyName: string } | null;
    }> = [];

    // TODO: Aktifkan setelah schema ditambah `targetEndDate` field
    // const lateProductions = await this.prisma.productionTracker.findMany({
    //   where: {
    //     status: ProductionStatus.COMPLETED,
    //     endDate: { not: null, gte: start, lte: end },
    //     targetEndDate: { not: null },
    //     // Filter: endDate lebih besar dari targetEndDate
    //   },
    //   select: {
    //     endDate: true,
    //     targetEndDate: true,
    //     order: { select: { dateOrder: true } },
    //     orderProduct: { select: { product: { select: { name: true } } } },
    //     vendor: { select: { companyName: true } },
    //   },
    // });

    const lateByMonthMap = new Map<string, number>();
    const lateByMonthSort = new Map<string, string>();
    const lateByVendorMap = new Map<string, number>();
    const lateByProductMap = new Map<string, number>();

    for (const lp of lateProductions) {
      if (!lp.endDate) continue;
      const dateKey = getDateKey(lp.endDate, rangeDays);
      const sortKey = getDateSortKey(lp.endDate, rangeDays);
      lateByMonthSort.set(dateKey, sortKey);
      incrementMap(lateByMonthMap, dateKey, 1);

      if (lp.vendor) {
        incrementMap(lateByVendorMap, lp.vendor.companyName, 1);
      }
      if (lp.orderProduct?.product) {
        incrementMap(lateByProductMap, lp.orderProduct.product.name, 1);
      }
    }

    const lateByMonth = Array.from(lateByMonthMap.entries())
      .map(([label, value]) => ({
        label,
        value,
        sortKey: lateByMonthSort.get(label) || "",
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(({ label, value }) => ({ label, value }));

    const lateByVendor = Array.from(lateByVendorMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const lateByProduct = Array.from(lateByProductMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      metrics: {
        production: productionCount,
        packaging: packagingCount,
        shipping: shippingCount,
        sendToCustomer: sendToCustCount,
        complete: completeCount,
      },
      averages: {
        avgProductionDays,
        avgShippingDays,
        avgFulfillmentDays,
      },
      lateDeliveries: {
        byMonth: lateByMonth,
        byVendor: lateByVendor,
        byProduct: lateByProduct,
      },
    };
  }

  // =======================================================================
  // SAMPLE - gabungan Order(salesCategory: SAMPLE) + OrderSampleFollowUp
  // =======================================================================
  private async getSampleData(range: { start: Date; end: Date }) {
    const { start, end } = range;

    // 1. Ambil semua order kategori SAMPLE di period
    const sampleOrders = await this.prisma.order.findMany({
      where: {
        salesCategory: SalesCategory.SAMPLE,
        dateOrder: { gte: start, lte: end },
        status: { not: OrderStatus.CANCELLED },
      },
      select: {
        id: true,
        clientId: true,
        totalAmount: true,
        cashflowSummary: {
          select: { totalCost: true },
        },
        sampleFollowUps: {
          select: { id: true, isDone: true },
        },
      },
    });

    const totalSample = sampleOrders.length;

    // 2. Total cost dari cashflowSummary (kalau ada)
    let totalCost = 0;
    let hasCostData = false;
    for (const so of sampleOrders) {
      if (so.cashflowSummary && so.cashflowSummary.length > 0) {
        hasCostData = true;
        totalCost += so.cashflowSummary.reduce(
          (sum, cs) => sum + Number(cs.totalCost),
          0,
        );
      }
    }

    // 3. Converted customer: client yang setelah dapat sample, melakukan order SALES
    const sampleClientIds = Array.from(
      new Set(
        sampleOrders.map((o) => o.clientId).filter((id): id is string => !!id),
      ),
    );

    let convertedCustomer = 0;
    if (sampleClientIds.length > 0) {
      const salesOrdersAfterSample = await this.prisma.order.findMany({
        where: {
          clientId: { in: sampleClientIds },
          salesCategory: SalesCategory.SALES,
          status: { not: OrderStatus.CANCELLED },
          // Tidak filter dateOrder karena konversi bisa terjadi kapan saja setelah sample
        },
        select: { clientId: true },
        distinct: ["clientId"],
      });
      convertedCustomer = salesOrdersAfterSample.length;
    }

    const conversionRate =
      sampleClientIds.length > 0
        ? (convertedCustomer / sampleClientIds.length) * 100
        : 0;

    // 4. Return of Sample (ROI): revenue dari converted customers / total cost
    let returnOfSample: number | null = null;
    if (hasCostData && totalCost > 0 && convertedCustomer > 0) {
      const convertedRevenue = await this.prisma.order.aggregate({
        where: {
          clientId: { in: sampleClientIds },
          salesCategory: SalesCategory.SALES,
          status: { not: OrderStatus.CANCELLED },
        },
        _sum: { totalAmount: true },
      });
      const revenue = Number(convertedRevenue._sum.totalAmount || 0);
      returnOfSample = revenue / totalCost;
    }

    // 5. Average follow-ups before conversion (proxy untuk effort)
    let avgFollowUpsBeforeConversion: number | null = null;
    if (sampleOrders.length > 0) {
      const totalFollowUps = sampleOrders.reduce(
        (sum, so) => sum + so.sampleFollowUps.length,
        0,
      );
      avgFollowUpsBeforeConversion = round(
        totalFollowUps / sampleOrders.length,
        1,
      );
    }

    return {
      totalSample,
      totalCost: hasCostData ? totalCost : null,
      convertedCustomer,
      conversionRate: round(conversionRate, 1),
      returnOfSample: returnOfSample !== null ? round(returnOfSample, 2) : null,
      avgFollowUpsBeforeConversion,
    };
  }

  // =======================================================================
  // QUOTATION
  // =======================================================================
  private async getQuotationData(range: { start: Date; end: Date }) {
    const { start, end } = range;

    // Group by status untuk count
    const statusCounts = await this.prisma.quotation.groupBy({
      by: ["status"],
      where: { createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    });

    const counts: Record<QuotationStatus, number> = {
      DRAFT: 0,
      SENT: 0,
      FOLLOW_UP: 0,
      ACCEPTED: 0,
      REJECTED: 0,
      EXPIRED: 0,
      CANCELLED: 0,
    };

    for (const sc of statusCounts) {
      counts[sc.status] = sc._count._all;
    }

    // Lead time: pakai followUps untuk akurasi
    // Lead time = waktu dari quotation dibuat sampai status ACCEPTED
    // Pakai followUps[].date terakhir untuk yang ACCEPTED sebagai approximasi
    const acceptedQuotations = await this.prisma.quotation.findMany({
      where: {
        status: QuotationStatus.ACCEPTED,
        createdAt: { gte: start, lte: end },
      },
      select: {
        createdAt: true,
        updatedAt: true,
        followUps: {
          select: { date: true },
          orderBy: { date: "desc" },
          take: 1,
        },
      },
    });

    let totalLeadTimeDays = 0;
    let leadTimeCount = 0;

    for (const q of acceptedQuotations) {
      // Prefer followUps terakhir, fallback ke updatedAt
      const acceptedDate = q.followUps[0]?.date || q.updatedAt;
      const diffMs = acceptedDate.getTime() - q.createdAt.getTime();
      if (diffMs >= 0) {
        totalLeadTimeDays += diffMs / (1000 * 60 * 60 * 24);
        leadTimeCount++;
      }
    }

    const avgLeadTimeDays =
      leadTimeCount > 0 ? round(totalLeadTimeDays / leadTimeCount, 1) : null;

    // Conversion rate
    const totalSentOrAfter =
      counts.SENT +
      counts.FOLLOW_UP +
      counts.ACCEPTED +
      counts.REJECTED +
      counts.EXPIRED;
    const conversionRate =
      totalSentOrAfter > 0 ? (counts.ACCEPTED / totalSentOrAfter) * 100 : 0;

    return {
      draft: counts.DRAFT,
      sent: counts.SENT,
      followUp: counts.FOLLOW_UP,
      accepted: counts.ACCEPTED,
      rejected: counts.REJECTED,
      expired: counts.EXPIRED,
      cancelled: counts.CANCELLED,
      avgLeadTimeDays,
      conversionRate: round(conversionRate, 1),
    };
  }

  // =======================================================================
  // HELPER: hitung rata-rata hari antara start dan end
  // =======================================================================
  private calculateAvgDays(
    pairs: Array<{ start: Date; end: Date }>,
  ): number | null {
    if (pairs.length === 0) return null;

    const totalDays = pairs.reduce((sum, p) => {
      const diffMs = p.end.getTime() - p.start.getTime();
      return sum + diffMs / (1000 * 60 * 60 * 24);
    }, 0);

    return round(totalDays / pairs.length, 1);
  }
}
