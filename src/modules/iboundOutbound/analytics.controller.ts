import { NextFunction, Request, Response } from "express";
import { autoInjectable } from "tsyringe";
import { OrderAnalyticsService } from "./analytics.service";

@autoInjectable()
export class OrderAnalyticsController {
  constructor(private readonly analyticsService: OrderAnalyticsService) {}

  // GET /analytics/logistics-summary
  getLogisticsSummary = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // Ambil query params dari Request
      const query = req.query as {
        page?: string;
        take?: string;
        search?: string;
        startDate?: string;
        endDate?: string;
      };

      // Konversi page & take ke number (service mengharapkan number)
      const serviceQuery = {
        ...query,
        page: query.page ? Number(query.page) : 1,
        take: query.take ? Number(query.take) : 10,
      };

      const result =
        await this.analyticsService.getOrderLogisticsSummary(serviceQuery);

      res.status(200).json({
        message: "Logistics summary retrieved",
        ...result, // ini akan spread { data: [...], meta: {...} }
      });
    } catch (error) {
      next(error);
    }
  };
}
