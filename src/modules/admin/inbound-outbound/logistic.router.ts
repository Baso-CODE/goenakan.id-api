import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { OrderAnalyticsController } from "./analytics.controller";
import { ProductionController } from "./production.controller";
import { ShipmentController } from "./shipment.controller";

@autoInjectable()
export class LogisticsRouter {
  private readonly router: Router = Router();

  constructor(
    private productionController: ProductionController,
    private shipmentController: ShipmentController,
    private analyticsController: OrderAnalyticsController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // ==========================================
    // === PRODUCTION ROUTES ===
    // ==========================================

    // 1. Start Production -> Otomatis butuh 'create' atau 'update'
    this.router.post("/production/start", this.productionController.start);

    // 2. Complete Production -> Otomatis butuh 'update'
    this.router.patch(
      "/production/:id/complete",
      this.productionController.complete,
    );

    // ==========================================
    // === SHIPMENT ROUTES (INBOUND/OUTBOUND) ===
    // ==========================================

    // 1. Create Shipment -> Otomatis butuh 'create'
    this.router.post("/shipments", this.shipmentController.create);

    // 2. Get List History per Order (Statis diletakkan di atas parameter `/:id`) -> Otomatis butuh 'read'
    this.router.get(
      "/shipments/order/:orderId",
      this.shipmentController.getHistoryByOrder,
    );

    // 3. Get Detail Shipment -> Otomatis butuh 'read'
    this.router.get("/shipments/:id", this.shipmentController.getOne);

    // 4. Update Status Tracking -> Otomatis butuh 'update'
    this.router.patch(
      "/shipments/:id/status",
      this.shipmentController.addHistory,
    );

    // 5. Update Info Header -> Otomatis butuh 'update'
    this.router.patch(
      "/shipments/:id/info",
      this.shipmentController.updateInfo,
    );

    // ==========================================
    // === ANALYTICS (DASHBOARD) ===
    // ==========================================

    // Get Logistics Summary -> Otomatis butuh 'read'
    this.router.get(
      "/analytics/summary",
      this.analyticsController.getLogisticsSummary,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
