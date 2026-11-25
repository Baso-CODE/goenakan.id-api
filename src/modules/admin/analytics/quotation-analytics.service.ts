import { OrderStatus, QuotationStatus, SalesCategory } from "@prisma/client";

import { injectable } from "tsyringe";

import { PrismaService } from "../../prisma/prisma.service";

import {
  AnalyticsFilterQuery,
  calculateDateRange,
  round,
} from "./analytics.helper";

interface QuotationAnalyticsResult {
  metrics: {
    totalQuotation: number;

    draft: number;
    sent: number;
    accepted: number;
    rejected: number;

    followUp: number;
    expired: number;
    cancelled: number;

    totalSampleOrders: number;
    totalSalesOrders: number;

    convertedToSample: number;
    convertedToSales: number;

    avgSendingLeadTimeDays: number | null;
    avgAcceptedToSampleDays: number | null;
    avgAcceptedToSalesDays: number | null;

    quotationToSampleRate: number | null;
    quotationToSalesRate: number | null;

    uniqueSampleConversionRate: number | null;
    uniqueSalesConversionRate: number | null;

    sendingLeadTimeCount: number;
    sampleLeadTimeCount: number;
    salesLeadTimeCount: number;
  };

  period: {
    start: Date;
    end: Date;
  };

  generatedAt: Date;
}

@injectable()
export class QuotationAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getQuotationAnalytics(
    query: AnalyticsFilterQuery,
  ): Promise<QuotationAnalyticsResult> {
    const range = calculateDateRange(query);
    const { start, end } = range;

    const generatedAt = new Date();

    // ==========================================
    // 1. FETCH QUOTATION & RESULTING ORDERS
    // ==========================================
    const quotations = await this.prisma.quotation.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
      },

      select: {
        id: true,
        status: true,
        createdAt: true,
        firstSentAt: true,
        firstAcceptedAt: true,

        resultingOrders: {
          where: {
            status: {
              not: OrderStatus.CANCELLED,
            },
            createdAt: {
              lte: generatedAt,
            },
          },

          select: {
            id: true,
            salesCategory: true,
            createdAt: true,
          },

          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });

    // ==========================================
    // 2. INITIALIZE STATUS COUNTERS
    // ==========================================
    const statusCounts: Record<QuotationStatus, number> = {
      DRAFT: 0,
      SENT: 0,
      FOLLOW_UP: 0,
      ACCEPTED: 0,
      REJECTED: 0,
      EXPIRED: 0,
      CANCELLED: 0,
    };

    let totalSampleOrders = 0;
    let totalSalesOrders = 0;

    let convertedToSample = 0;
    let convertedToSales = 0;

    const sendingLeadTimes: number[] = [];
    const sampleLeadTimes: number[] = [];
    const salesLeadTimes: number[] = [];

    // ==========================================
    // 3. PROCESS EACH QUOTATION
    // ==========================================
    for (const quotation of quotations) {
      statusCounts[quotation.status]++;

      // ========================================
      // 3A. DRAFT TO SENT LEAD TIME
      // ========================================
      if (quotation.firstSentAt) {
        const duration = this.calculateDays(
          quotation.createdAt,
          quotation.firstSentAt,
        );

        if (duration !== null && quotation.firstSentAt <= generatedAt) {
          sendingLeadTimes.push(duration);
        }
      }

      // ========================================
      // 3B. FILTER VALID LINKED ORDERS
      // ========================================
      const validOrders = quotation.resultingOrders.filter(
        (order) => order.createdAt >= quotation.createdAt,
      );

      const sampleOrders = validOrders.filter(
        (order) => order.salesCategory === SalesCategory.SAMPLE,
      );

      const salesOrders = validOrders.filter(
        (order) => order.salesCategory === SalesCategory.SALES,
      );

      totalSampleOrders += sampleOrders.length;
      totalSalesOrders += salesOrders.length;

      // ========================================
      // 3C. UNIQUE QUOTATION CONVERSION
      // ========================================
      if (sampleOrders.length > 0) {
        convertedToSample++;
      }

      if (salesOrders.length > 0) {
        convertedToSales++;
      }

      // ========================================
      // 3D. ACCEPTED TO FIRST SAMPLE ORDER
      // ========================================
      const acceptedAt = quotation.firstAcceptedAt;

      if (
        !acceptedAt ||
        acceptedAt < quotation.createdAt ||
        acceptedAt > generatedAt
      ) {
        continue;
      }

      const firstSampleOrder = sampleOrders[0];

      if (firstSampleOrder) {
        const duration = this.calculateDays(
          acceptedAt,
          firstSampleOrder.createdAt,
        );

        if (duration !== null) {
          sampleLeadTimes.push(duration);
        }
      }

      // ========================================
      // 3E. ACCEPTED TO FIRST SALES ORDER
      // ========================================
      const firstSalesOrder = salesOrders[0];

      if (firstSalesOrder) {
        const duration = this.calculateDays(
          acceptedAt,
          firstSalesOrder.createdAt,
        );

        if (duration !== null) {
          salesLeadTimes.push(duration);
        }
      }
    }

    // ==========================================
    // 4. TOTAL QUOTATION
    // ==========================================
    const totalQuotation = quotations.length;

    // ==========================================
    // 5. FINAL RESPONSE
    // ==========================================
    return {
      metrics: {
        totalQuotation,

        draft: statusCounts.DRAFT,
        sent: statusCounts.SENT,
        accepted: statusCounts.ACCEPTED,
        rejected: statusCounts.REJECTED,

        followUp: statusCounts.FOLLOW_UP,
        expired: statusCounts.EXPIRED,
        cancelled: statusCounts.CANCELLED,

        totalSampleOrders,
        totalSalesOrders,

        convertedToSample,
        convertedToSales,

        // Lead time averages
        avgSendingLeadTimeDays: this.calculateAverage(sendingLeadTimes),

        avgAcceptedToSampleDays: this.calculateAverage(sampleLeadTimes),

        avgAcceptedToSalesDays: this.calculateAverage(salesLeadTimes),

        // Order-based rates sesuai requirement
        quotationToSampleRate: this.calculateRate(
          totalSampleOrders,
          totalQuotation,
        ),

        quotationToSalesRate: this.calculateRate(
          totalSalesOrders,
          totalQuotation,
        ),

        // Unique quotation-based conversion
        uniqueSampleConversionRate: this.calculateRate(
          convertedToSample,
          totalQuotation,
        ),

        uniqueSalesConversionRate: this.calculateRate(
          convertedToSales,
          totalQuotation,
        ),

        // Valid lead time records
        sendingLeadTimeCount: sendingLeadTimes.length,

        sampleLeadTimeCount: sampleLeadTimes.length,

        salesLeadTimeCount: salesLeadTimes.length,
      },

      period: range,

      generatedAt,
    };
  }

  // ==========================================
  // HELPERS
  // ==========================================
  private calculateDays(start: Date, end: Date): number | null {
    const diffMs = end.getTime() - start.getTime();

    if (!Number.isFinite(diffMs) || diffMs < 0) {
      return null;
    }

    return diffMs / (1000 * 60 * 60 * 24);
  }

  private calculateAverage(values: number[]): number | null {
    if (values.length === 0) {
      return null;
    }

    const total = values.reduce((sum, value) => sum + value, 0);

    return round(total / values.length, 1);
  }

  private calculateRate(numerator: number, denominator: number): number | null {
    if (denominator <= 0) {
      return null;
    }

    return round((numerator / denominator) * 100, 1);
  }
}
