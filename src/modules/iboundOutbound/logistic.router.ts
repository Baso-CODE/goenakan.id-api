import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
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
    // === PRODUCTION ===
    this.router.post(
      "/production/start",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.productionController.start,
    );
    this.router.patch(
      "/production/:id/complete",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.productionController.complete,
    );

    // === SHIPMENT (INBOUND/OUTBOUND) ===
    this.router.post(
      "/shipments",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.shipmentController.create,
    );
    this.router.patch(
      "/shipments/:id/arrive",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.shipmentController.markArrived,
    );
    this.router.get(
      "/shipments/order/:orderId",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.shipmentController.getHistoryByOrder,
    );

    // === ANALYTICS (DASHBOARD) ===
    this.router.get(
      "/analytics/summary",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.analyticsController.getLogisticsSummary,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
