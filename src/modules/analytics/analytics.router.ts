// src/modules/analytics/analytics.route.ts

import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { AnalyticsController } from "./analytics.controller";

import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";

@autoInjectable()
export class AnalyticsRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly analyticsController: AnalyticsController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // =========================================================================
    // ENDPOINT TAB 2: SALES OVERVIEW
    // URL: GET /api/analytics/sales-overview?range=...
    // =========================================================================
    this.router.get(
      "/sales-overview",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.analyticsController.getSalesOverview,
    );

    // =========================================================================
    // ENDPOINT TAB 3: CUSTOMER ANALYTICS (Template untuk dikerjakan nanti)
    // URL: GET /api/analytics/customers?range=...
    // =========================================================================
    this.router.get(
      "/customers",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.analyticsController.getCustomerAnalytics,
    );

    // =========================================================================
    // ENDPOINT TAB 4: OPERATIONS (Template untuk dikerjakan nanti)
    // URL: GET /api/analytics/operations?range=...
    // =========================================================================
    // this.router.get(
    //   "/operations",
    //   this.nextAuthMiddleware.verifyNextAuthToken,
    //   verifyRole(["SUPER_ADMIN"]),
    //   this.analyticsController.getOperations,
    // );
  };

  getRouter(): Router {
    return this.router;
  }
}
