// src/modules/analytics/analytics.controller.ts

import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { AnalyticsFilterQuery } from "./analytics.helper";
import { AnalyticsService } from "./analytics.service";

// =========================================================================
// CONSTANTS
// =========================================================================

const VALID_RANGES = [
  "today",
  "7days",
  "14days",
  "30days",
  "90days",
  "1year",
  "custom",
] as const;

type ValidRange = (typeof VALID_RANGES)[number];

const DEFAULT_RANGE: ValidRange = "30days";

// =========================================================================
// CUSTOM ERROR
// =========================================================================
class ValidationError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// =========================================================================
// CONTROLLER
// =========================================================================

@injectable()
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  // =======================================================================
  // TAB 2: Sales Overview
  // =======================================================================
  getSalesOverview = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const queryParams = this.parseFilterQuery(req, DEFAULT_RANGE);

      const data =
        await this.analyticsService.getSalesOverviewData(queryParams);

      res.status(200).json({
        success: true,
        data,
        meta: {
          range: queryParams.range,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // =======================================================================
  // TAB 3: Customer Analytics
  // =======================================================================
  getCustomerAnalytics = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const queryParams = this.parseFilterQuery(req, DEFAULT_RANGE);

      const data =
        await this.analyticsService.getCustomerAnalyticsData(queryParams);

      res.status(200).json({
        success: true,
        data,
        meta: {
          range: queryParams.range,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // =======================================================================
  // TAB 4: Ops Analytics (BARU - sebelumnya belum di-expose)
  // =======================================================================
  getOpsAnalytics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queryParams = this.parseFilterQuery(req, DEFAULT_RANGE);

      const data = await this.analyticsService.getOpsAnalyticsData(queryParams);

      res.status(200).json({
        success: true,
        data,
        meta: {
          range: queryParams.range,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // =======================================================================
  // PRIVATE HELPERS
  // =======================================================================

  /**
   * Parse & validasi query parameters dari request.
   * Throw ValidationError kalau parameter tidak valid.
   */
  private parseFilterQuery(
    req: Request,
    defaultRange: ValidRange,
  ): AnalyticsFilterQuery {
    const { range, startDate, endDate } = req.query;

    // 1. Validasi range
    const rangeStr = range ? String(range).toLowerCase() : defaultRange;

    if (!this.isValidRange(rangeStr)) {
      throw new ValidationError(
        `Invalid range parameter. Allowed: ${VALID_RANGES.join(", ")}`,
      );
    }

    // 2. Validasi custom range
    let parsedStartDate: string | undefined;
    let parsedEndDate: string | undefined;

    if (rangeStr === "custom") {
      if (!startDate || !endDate) {
        throw new ValidationError(
          "startDate and endDate are required when range=custom",
        );
      }

      const startStr = String(startDate);
      const endStr = String(endDate);

      // Validasi format date
      const startObj = new Date(startStr);
      const endObj = new Date(endStr);

      if (isNaN(startObj.getTime())) {
        throw new ValidationError(
          "Invalid startDate format. Use ISO 8601 (e.g. 2026-01-01 or 2026-01-01T00:00:00Z)",
        );
      }

      if (isNaN(endObj.getTime())) {
        throw new ValidationError(
          "Invalid endDate format. Use ISO 8601 (e.g. 2026-01-31 or 2026-01-31T23:59:59Z)",
        );
      }

      // Validasi start <= end
      if (startObj > endObj) {
        throw new ValidationError(
          "startDate must be before or equal to endDate",
        );
      }

      // Validasi range maksimal 1 tahun (proteksi performa)
      const maxRangeDays = 366;
      const diffDays =
        (endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > maxRangeDays) {
        throw new ValidationError(
          `Custom range cannot exceed ${maxRangeDays} days`,
        );
      }

      parsedStartDate = startStr;
      parsedEndDate = endStr;
    }

    return {
      range: rangeStr,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
    };
  }

  private isValidRange(range: string): range is ValidRange {
    return VALID_RANGES.includes(range as ValidRange);
  }
}
