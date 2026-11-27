import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { verifySuperAdmin } from "../../../middleware/superAdmin.middleware";
import { AnalyticsController } from "./analytics.controller";

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
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Semua rute di bawahnya akan otomatis terlindungi.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    //  Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    // Own dashboard does NOT require the company-wide read_analytics permission.
    // Service enforces ADMIN_SALES role and resolves identity from the token.
    this.router.get(
      "/sales-performance/me",
      this.analyticsController.getMySalesPerformance,
    );
    this.router.get(
      "/sales-performance/ownership",
      verifySuperAdmin,
      this.analyticsController.getSalesOwnership,
    );
    this.router.patch(
      "/sales-performance/ownership",
      verifySuperAdmin,
      this.analyticsController.changeSalesOwnership,
    );
    this.router.get(
      "/sales-performance",
      verifySuperAdmin,
      this.analyticsController.getSalesPerformance,
    );

    this.router.use(autoVerifyPermission("analytics"));

    // =========================================================================
    // ENDPOINT TAB 2: SALES OVERVIEW
    // URL: GET /api/analytics/sales-overview?range=...
    // =========================================================================
    this.router.get(
      "/sales-overview",
      this.analyticsController.getSalesOverview,
    );

    // =========================================================================
    // ENDPOINT TAB 3: CUSTOMER ANALYTICS
    // URL: GET /api/analytics/customers?range=...
    // =========================================================================
    this.router.get(
      "/customers",
      this.analyticsController.getCustomerAnalytics,
    );

    // =========================================================================
    // ENDPOINT TAB 4: OPERATIONS
    // URL: GET /api/analytics/operations?range=...
    // =========================================================================
    this.router.get("/operations", this.analyticsController.getOpsAnalytics);

    // TAB 5: QUOTATION ANALYTICS
    this.router.get(
      "/quotations",
      this.analyticsController.getQuotationAnalytics,
    );

    // TAB 6: SAMPLE ANALYTICS
    this.router.get(
      "/samples",
      verifySuperAdmin,
      this.analyticsController.getSampleAnalytics,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
