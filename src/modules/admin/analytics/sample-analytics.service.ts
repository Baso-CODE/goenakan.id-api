import {
  CashflowStatus,
  OrderStatus,
  Prisma,
  SalesCategory,
} from "@prisma/client";
import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { PrismaService } from "../../prisma/prisma.service";

import {
  AnalyticsFilterQuery,
  calculateDateRange,
  round,
} from "./analytics.helper";

// ==========================================
// TYPES
// ==========================================
export interface SampleAnalyticsQuery extends AnalyticsFilterQuery {
  currency?: string;
  salesUserId?: string;
  page?: number;
  limit?: number;
}

interface LinkedSalesOrder {
  id: string;
  orderNumber: string | null;
  dateOrder: Date;
  currencyCode: string;
  amount: Prisma.Decimal;
}

interface SampleRow {
  id: string;
  orderNumber: string;
  dateOrder: Date;
  status: string;

  clientId: string;
  customerName: string;

  salesUserId: string | null;
  salesName: string;

  currencyCode: string;
  sampleAmount: Prisma.Decimal;

  cost: Prisma.Decimal | null;
  costCurrency: string | null;

  costStatus: "APPROVED" | "DRAFT" | "MISSING" | "DUPLICATE";

  totalFollowUps: number;
  completedFollowUps: number;
  pendingFollowUps: number;
  overdueFollowUps: number;

  linkedSalesOrders: LinkedSalesOrder[];
  conversionDays: number | null;
  invalidLinks: number;
}

const DAY_MS = 86_400_000;
const UNASSIGNED = "unassigned";

// ==========================================
// HELPERS
// ==========================================
function moneySum(values: Prisma.Decimal[]): number {
  return values
    .reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0))
    .toNumber();
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round((numerator / denominator) * 100, 1) : null;
}

function average(values: number[]): number | null {
  return values.length > 0
    ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 1)
    : null;
}

function getJakartaDateKey(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

// ==========================================
// SUMMARY AGGREGATION
// ==========================================
function summarizeSamples(
  rows: SampleRow[],
  currency: string,
  firstSalesOrderIds: Set<string>,
) {
  const convertedRows = rows.filter((row) => row.linkedSalesOrders.length > 0);

  const unconvertedRows = rows.filter(
    (row) => row.linkedSalesOrders.length === 0,
  );

  const customers = new Set(rows.map((row) => row.clientId));

  const convertedCustomers = new Set(convertedRows.map((row) => row.clientId));

  // ========================================
  // LINKED SALES ORDERS
  // ========================================
  const linkedOrders = [
    ...new Map(
      rows
        .flatMap((row) => row.linkedSalesOrders)
        .map((order) => [order.id, order] as const),
    ).values(),
  ];

  const linkedOrdersInCurrency = linkedOrders.filter(
    (order) => order.currencyCode === currency,
  );

  // ========================================
  // NEW & RETURNING CUSTOMERS
  // ========================================
  const newCustomers = new Set(
    convertedRows
      .filter((row) =>
        row.linkedSalesOrders.some((order) => firstSalesOrderIds.has(order.id)),
      )
      .map((row) => row.clientId),
  );

  const returningCustomers = convertedCustomers.size - newCustomers.size;

  // ========================================
  // FINANCIAL PERFORMANCE
  // ========================================
  const sampleOrdersInCurrency = rows.filter(
    (row) => row.currencyCode === currency,
  );

  const totalSampleValue = moneySum(
    sampleOrdersInCurrency.map((row) => row.sampleAmount),
  );

  const rowsWithApprovedCost = rows.filter(
    (row) => row.costStatus === "APPROVED" && row.cost !== null,
  );

  const costRowsInCurrency = rowsWithApprovedCost.filter(
    (row) => row.costCurrency === currency,
  );

  const totalSampleCost =
    costRowsInCurrency.length > 0
      ? moneySum(costRowsInCurrency.map((row) => row.cost!))
      : null;

  const convertedSalesValue = moneySum(
    linkedOrdersInCurrency.map((order) => order.amount),
  );

  // Rasio hanya diterbitkan jika seluruh
  // sample memiliki approved cost dalam
  // currency yang dipilih.
  const completeCostCoverage =
    rows.length > 0 && costRowsInCurrency.length === rows.length;

  const completeSalesCurrencyCoverage =
    linkedOrdersInCurrency.length === linkedOrders.length;

  const revenueToCostRatio =
    completeCostCoverage &&
    completeSalesCurrencyCoverage &&
    totalSampleCost !== null &&
    totalSampleCost > 0
      ? round(convertedSalesValue / totalSampleCost, 2)
      : null;

  const costPerConversion =
    completeCostCoverage && totalSampleCost !== null && convertedRows.length > 0
      ? round(totalSampleCost / convertedRows.length, 2)
      : null;

  // ========================================
  // FOLLOW-UP PERFORMANCE
  // ========================================
  const totalFollowUps = rows.reduce((sum, row) => sum + row.totalFollowUps, 0);

  const completedFollowUps = rows.reduce(
    (sum, row) => sum + row.completedFollowUps,
    0,
  );

  const pendingFollowUps = rows.reduce(
    (sum, row) => sum + row.pendingFollowUps,
    0,
  );

  const overdueFollowUps = rows.reduce(
    (sum, row) => sum + row.overdueFollowUps,
    0,
  );

  const samplesWithFollowUps = rows.filter(
    (row) => row.totalFollowUps > 0,
  ).length;

  const samplesWithCompletedFollowUps = rows.filter(
    (row) => row.completedFollowUps > 0,
  ).length;

  const samplesWithoutFollowUps = rows.length - samplesWithFollowUps;

  const conversionTimes = convertedRows
    .map((row) => row.conversionDays)
    .filter((value): value is number => value !== null);

  return {
    // SAMPLE OVERVIEW
    totalSamples: rows.length,
    sampleCustomers: customers.size,

    convertedSamples: convertedRows.length,
    unconvertedSamples: unconvertedRows.length,

    convertedCustomers: convertedCustomers.size,

    sampleConversionRate: percentage(convertedRows.length, rows.length),

    customerConversionRate: percentage(convertedCustomers.size, customers.size),

    totalLinkedSalesOrders: linkedOrders.length,

    // CUSTOMER ANALYTICS
    newConvertedCustomers: newCustomers.size,

    returningConvertedCustomers: returningCustomers,

    // LEAD TIME
    averageConversionDays: average(conversionTimes),

    conversionLeadTimeCount: conversionTimes.length,

    // FINANCIAL
    totalSampleValue,
    totalSampleCost,
    convertedSalesValue,
    revenueToCostRatio,
    costPerConversion,

    sampleOrdersInCurrency: sampleOrdersInCurrency.length,

    linkedSalesOrdersInCurrency: linkedOrdersInCurrency.length,

    approvedCostSamples: rowsWithApprovedCost.length,

    costSamplesInCurrency: costRowsInCurrency.length,

    costCoverageRate: percentage(costRowsInCurrency.length, rows.length),

    // FOLLOW-UP
    totalFollowUps,
    completedFollowUps,
    pendingFollowUps,
    overdueFollowUps,

    followUpCompletionRate: percentage(completedFollowUps, totalFollowUps),

    samplesWithFollowUps,
    samplesWithCompletedFollowUps,
    samplesWithoutFollowUps,

    averageFollowUpsPerSample:
      rows.length > 0 ? round(totalFollowUps / rows.length, 1) : null,
  };
}

// ==========================================
// SERVICE
// ==========================================
@injectable()
export class SampleAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSampleAnalytics(query: SampleAnalyticsQuery) {
    const range = calculateDateRange(query);

    const generatedAt = new Date();

    const currency = query.currency?.trim().toUpperCase() || "IDR";

    const selectedSalesUserId = query.salesUserId?.trim() || undefined;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // ======================================
    // 1. VALIDATE FILTERS
    // ======================================
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new ApiError("Invalid currency code", 400);
    }

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 1_000_000 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new ApiError("Invalid pagination", 400);
    }

    if (
      !Number.isFinite(range.start.getTime()) ||
      !Number.isFinite(range.end.getTime()) ||
      range.start > range.end
    ) {
      throw new ApiError("Invalid date range", 400);
    }

    const cohortEnd = new Date(
      Math.min(range.end.getTime(), generatedAt.getTime()),
    );

    const cohortWhere: Prisma.OrderWhereInput = {
      salesCategory: SalesCategory.SAMPLE,

      status: {
        not: OrderStatus.CANCELLED,
      },

      dateOrder: {
        gte: range.start,
        lte: cohortEnd,
      },
    };

    // ======================================
    // 2. FILTER OPTIONS
    // ======================================
    const [currencyRecords, salesUsers] = await Promise.all([
      this.prisma.currency.findMany({
        select: {
          code: true,
          name: true,
        },
        orderBy: {
          code: "asc",
        },
      }),

      this.prisma.user.findMany({
        where: {
          OR: [
            {
              role: {
                name: "ADMIN_SALES",
              },
            },
            {
              salesOrders: {
                some: cohortWhere,
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      }),
    ]);

    if (!currencyRecords.some((item) => item.code === currency)) {
      throw new ApiError("Currency not found", 400);
    }

    if (
      selectedSalesUserId &&
      selectedSalesUserId !== UNASSIGNED &&
      !salesUsers.some((user) => user.id === selectedSalesUserId)
    ) {
      throw new ApiError("Sales user not found", 404);
    }

    const sampleWhere: Prisma.OrderWhereInput = {
      ...cohortWhere,

      ...(selectedSalesUserId
        ? {
            salesUserId:
              selectedSalesUserId === UNASSIGNED ? null : selectedSalesUserId,
          }
        : {}),
    };

    // ======================================
    // 3. FETCH SAMPLE COHORT
    // ======================================
    const sampleOrders = await this.prisma.order.findMany({
      where: sampleWhere,

      select: {
        id: true,
        orderNumber: true,
        dateOrder: true,
        status: true,

        clientId: true,
        currencyCode: true,
        totalAmount: true,
        salesUserId: true,

        client: {
          select: {
            custCode: true,

            b2b: {
              select: {
                companyName: true,
              },
            },

            b2c: {
              select: {
                name: true,
              },
            },
          },
        },

        salesUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },

        cashflowSummary: {
          select: {
            id: true,
            status: true,
            baseCurrencyId: true,
            totalCost: true,
          },
        },

        sampleFollowUps: {
          select: {
            id: true,
            date: true,
            isDone: true,
          },
        },

        resultingOrders: {
          where: {
            salesCategory: SalesCategory.SALES,

            status: {
              not: OrderStatus.CANCELLED,
            },

            dateOrder: {
              lte: generatedAt,
            },
          },

          select: {
            id: true,
            orderNumber: true,
            clientId: true,
            dateOrder: true,
            currencyCode: true,
            totalAmount: true,
          },

          orderBy: [
            {
              dateOrder: "asc",
            },
            {
              id: "asc",
            },
          ],
        },
      },

      orderBy: [
        {
          dateOrder: "desc",
        },
        {
          id: "desc",
        },
      ],
    });

    // ======================================
    // 4. NORMALIZE SAMPLE ROWS
    // ======================================
    const rows: SampleRow[] = sampleOrders.map((sample) => {
      const validLinkedOrders = sample.resultingOrders.filter(
        (order) =>
          order.clientId === sample.clientId &&
          order.dateOrder >= sample.dateOrder,
      );

      const linkedSalesOrders = validLinkedOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        dateOrder: order.dateOrder,
        currencyCode: order.currencyCode,
        amount: order.totalAmount,
      }));

      // Jangan menjumlahkan beberapa
      // summary jika ditemukan duplikasi.
      const summaries = sample.cashflowSummary;

      const summary = summaries.length === 1 ? summaries[0] : null;

      let costStatus: SampleRow["costStatus"] = "MISSING";

      if (summaries.length > 1) {
        costStatus = "DUPLICATE";
      } else if (summary) {
        costStatus =
          summary.status === CashflowStatus.APPROVED ? "APPROVED" : "DRAFT";
      }

      const firstConversion = linkedSalesOrders[0];

      const conversionDays = firstConversion
        ? (firstConversion.dateOrder.getTime() - sample.dateOrder.getTime()) /
          DAY_MS
        : null;

      const completedFollowUps = sample.sampleFollowUps.filter(
        (item) => item.isDone,
      ).length;

      const overdueFollowUps = sample.sampleFollowUps.filter(
        (item) => !item.isDone && item.date < generatedAt,
      ).length;

      return {
        id: sample.id,

        orderNumber: sample.orderNumber || sample.id,

        dateOrder: sample.dateOrder,
        status: sample.status,

        clientId: sample.clientId,

        customerName:
          sample.client.b2b?.companyName ||
          sample.client.b2c?.name ||
          sample.client.custCode,

        salesUserId: sample.salesUserId,

        salesName:
          sample.salesUser?.name || sample.salesUser?.email || "Unassigned",

        currencyCode: sample.currencyCode,

        sampleAmount: sample.totalAmount,

        cost: costStatus === "APPROVED" ? summary!.totalCost : null,

        costCurrency: summary?.baseCurrencyId || null,

        costStatus,

        totalFollowUps: sample.sampleFollowUps.length,

        completedFollowUps,

        pendingFollowUps: sample.sampleFollowUps.length - completedFollowUps,

        overdueFollowUps,

        linkedSalesOrders,
        conversionDays,

        invalidLinks: sample.resultingOrders.length - validLinkedOrders.length,
      };
    });

    // ======================================
    // 5. FIRST-EVER SALES ORDER
    // ======================================
    const convertedClientIds = [
      ...new Set(
        rows
          .filter((row) => row.linkedSalesOrders.length > 0)
          .map((row) => row.clientId),
      ),
    ];

    const firstSalesOrders =
      convertedClientIds.length > 0
        ? await this.prisma.order.findMany({
            where: {
              clientId: {
                in: convertedClientIds,
              },

              salesCategory: SalesCategory.SALES,

              status: {
                not: OrderStatus.CANCELLED,
              },

              dateOrder: {
                lte: generatedAt,
              },
            },

            select: {
              id: true,
              clientId: true,
            },

            orderBy: [
              {
                dateOrder: "asc",
              },
              {
                id: "asc",
              },
            ],

            distinct: ["clientId"],
          })
        : [];

    const firstSalesOrderIds = new Set(
      firstSalesOrders.map((order) => order.id),
    );

    // ======================================
    // 6. OVERVIEW METRICS
    // ======================================
    const metrics = summarizeSamples(rows, currency, firstSalesOrderIds);

    // ======================================
    // 7. SAMPLE CONVERSION TREND
    // ======================================
    const rangeDays = Math.max(
      1,
      Math.ceil((range.end.getTime() - range.start.getTime()) / DAY_MS),
    );

    const isDaily = rangeDays <= 31;

    const getPeriodKey = (date: Date) => {
      const key = getJakartaDateKey(date);

      return isDaily ? key : key.slice(0, 7);
    };

    const trendMap = new Map<
      string,
      {
        period: string;
        samples: number;
        convertedSamples: number;
        unconvertedSamples: number;
      }
    >();

    // Isi periode kosong agar grafik
    // tetap memiliki timeline yang utuh.
    const cursor = new Date(`${getJakartaDateKey(range.start)}T00:00:00Z`);

    if (!isDaily) {
      cursor.setUTCDate(1);
    }

    const lastKey = getPeriodKey(cohortEnd);

    while (cursor.toISOString().slice(0, isDaily ? 10 : 7) <= lastKey) {
      const key = cursor.toISOString().slice(0, isDaily ? 10 : 7);

      trendMap.set(key, {
        period: key,
        samples: 0,
        convertedSamples: 0,
        unconvertedSamples: 0,
      });

      if (isDaily) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      } else {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    }

    for (const row of rows) {
      const key = getPeriodKey(row.dateOrder);

      const bucket = trendMap.get(key);

      if (!bucket) continue;

      bucket.samples++;

      if (row.linkedSalesOrders.length > 0) {
        bucket.convertedSamples++;
      } else {
        bucket.unconvertedSamples++;
      }
    }

    const trend = Array.from(trendMap.values()).map((bucket) => ({
      ...bucket,

      conversionRate: percentage(bucket.convertedSamples, bucket.samples),
    }));

    // ======================================
    // 8. SALES PERFORMANCE
    // ======================================
    const salesGroups = new Map<
      string,
      {
        salesUserId: string | null;
        salesName: string;
        rows: SampleRow[];
      }
    >();

    for (const row of rows) {
      const key = row.salesUserId || UNASSIGNED;

      if (!salesGroups.has(key)) {
        salesGroups.set(key, {
          salesUserId: row.salesUserId,
          salesName: row.salesName,
          rows: [],
        });
      }

      salesGroups.get(key)!.rows.push(row);
    }

    const salesPerformance = Array.from(salesGroups.values())
      .map((group) => ({
        salesUserId: group.salesUserId,

        salesName: group.salesName,

        ...summarizeSamples(group.rows, currency, firstSalesOrderIds),
      }))
      .sort(
        (a, b) =>
          b.convertedSamples - a.convertedSamples ||
          b.totalSamples - a.totalSamples,
      );

    // ======================================
    // 9. FOLLOW-UP COVERAGE
    // ======================================
    const followUpCoverage = [
      {
        name: "With Follow-up",
        value: metrics.samplesWithFollowUps,
      },
      {
        name: "Without Follow-up",
        value: metrics.samplesWithoutFollowUps,
      },
    ];

    // ======================================
    // 10. CONVERSION BREAKDOWN
    // ======================================
    const conversionBreakdown = [
      {
        name: "Converted",
        value: metrics.convertedSamples,
      },
      {
        name: "Not Converted",
        value: metrics.unconvertedSamples,
      },
    ];

    const customerBreakdown = [
      {
        name: "New Customer",
        value: metrics.newConvertedCustomers,
      },
      {
        name: "Returning Customer",
        value: metrics.returningConvertedCustomers,
      },
    ];

    // ======================================
    // 11. PAGINATED DETAIL TABLE
    // ======================================
    const totalDetails = rows.length;

    const offset = (page - 1) * limit;

    const details = rows.slice(offset, offset + limit).map((row) => {
      const firstOrder = row.linkedSalesOrders[0];

      const selectedCurrencyOrders = row.linkedSalesOrders.filter(
        (order) => order.currencyCode === currency,
      );

      return {
        id: row.id,
        orderNumber: row.orderNumber,
        dateOrder: row.dateOrder,
        status: row.status,

        clientId: row.clientId,
        customerName: row.customerName,

        salesUserId: row.salesUserId,
        salesName: row.salesName,

        sampleCurrency: row.currencyCode,

        sampleValue: row.sampleAmount.toNumber(),

        sampleCost: row.cost?.toNumber() ?? null,

        costCurrency: row.costCurrency,

        costStatus: row.costStatus,

        isConverted: row.linkedSalesOrders.length > 0,

        linkedSalesOrderCount: row.linkedSalesOrders.length,

        linkedSalesValue: moneySum(
          selectedCurrencyOrders.map((order) => order.amount),
        ),

        linkedSalesCurrency: currency,

        firstSalesOrderId: firstOrder?.id ?? null,

        firstSalesOrderNumber: firstOrder?.orderNumber ?? null,

        firstConversionDate: firstOrder?.dateOrder ?? null,

        conversionDays:
          row.conversionDays !== null ? round(row.conversionDays, 1) : null,

        totalFollowUps: row.totalFollowUps,

        completedFollowUps: row.completedFollowUps,

        pendingFollowUps: row.pendingFollowUps,

        overdueFollowUps: row.overdueFollowUps,
      };
    });

    // ======================================
    // 12. DATA QUALITY
    // ======================================
    const dataQuality = {
      unassignedSamples: rows.filter((row) => row.salesUserId === null).length,

      invalidConversionLinks: rows.reduce(
        (sum, row) => sum + row.invalidLinks,
        0,
      ),

      missingCashflow: rows.filter((row) => row.costStatus === "MISSING")
        .length,

      draftCashflow: rows.filter((row) => row.costStatus === "DRAFT").length,

      duplicateCashflow: rows.filter((row) => row.costStatus === "DUPLICATE")
        .length,

      approvedCashflowOtherCurrency: rows.filter(
        (row) => row.costStatus === "APPROVED" && row.costCurrency !== currency,
      ).length,

      linkedSalesOtherCurrency:
        metrics.totalLinkedSalesOrders - metrics.linkedSalesOrdersInCurrency,
    };

    // ======================================
    // 13. FINAL RESPONSE
    // ======================================
    return {
      period: {
        start: range.start,
        end: range.end,
        generatedAt,
        granularity: isDaily ? "day" : "month",
      },

      filters: {
        currency,

        salesUserId: selectedSalesUserId || null,

        currencies: currencyRecords,

        salesUsers: [
          ...salesUsers.map((user) => ({
            id: user.id,
            name: user.name || user.email,
            role: user.role.name,
          })),
          {
            id: UNASSIGNED,
            name: "Unassigned",
            role: null,
          },
        ],
      },

      metrics,

      charts: {
        trend,
        conversionBreakdown,
        customerBreakdown,
        followUpCoverage,
      },

      salesPerformance,

      details: {
        items: details,

        pagination: {
          page,
          limit,
          total: totalDetails,

          totalPages: Math.ceil(totalDetails / limit),

          hasNext: page * limit < totalDetails,
        },
      },

      dataQuality,
    };
  }
}
