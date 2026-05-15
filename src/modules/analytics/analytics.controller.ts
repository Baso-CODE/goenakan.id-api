// src/modules/analytics/analytics.controller.ts

import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { AnalyticsService } from "./analytics.service";

@injectable()
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  // Handler untuk API Tab 2 (Sales Overview)
  getSalesOverview = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // 1. Ambil parameter dari query URL
      const { range, startDate, endDate } = req.query;

      // 2. Format query agar aman dibaca oleh Service
      const queryParams = {
        range: range ? String(range) : "today", // Default "today" jika tidak dikirim
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
      };

      // 3. Panggil Service Sales Overview
      const data =
        await this.analyticsService.getSalesOverviewData(queryParams);

      // 4. Kirim respons ke Frontend
      res.status(200).send({
        success: true,
        data: data,
      });
    } catch (error) {
      next(error);
    }
  };

  // Handler untuk API Tab 3 (Customer Analytics)
  getCustomerAnalytics = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { range, startDate, endDate } = req.query;
      const queryParams = {
        range: range ? String(range) : "30days",
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
      };

      const data =
        await this.analyticsService.getCustomerAnalyticsData(queryParams);

      res.status(200).send({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
