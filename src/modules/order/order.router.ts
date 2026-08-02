import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { CreateOrderDTO } from "./dto/createOrder.dto";
import { UpdateOrderDTO } from "./dto/upadateOrder.dto";
import { OrderController } from "./order.controller";

@autoInjectable()
export class OrderRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly orderController: OrderController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/all",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.getAllOrder,
    );

    this.router.get(
      "/samples",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.getSampleOrders,
    );

    this.router.get(
      "/list-samples",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.orderController.getSampleOrderReferences,
    );

    this.router.get(
      "/stats/sample",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.getSampleStats,
    );

    this.router.get(
      "/stats/general",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.getGeneralStats,
    );

    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.exportOrders,
    );

    this.router.get(
      "/generate-po",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.generatePoNumber,
    );

    this.router.get(
      "/analytics/charts",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_INVOICE"]),
      this.orderController.getChartData,
    );

    this.router.get(
      "/analytics/metrics",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_INVOICE"]),
      this.orderController.getMetrics,
    );

    this.router.get(
      "/:id/tracking",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.getForTracking,
    );

    this.router.get(
      "/:id/edit-data",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.getOrderByIdUpdate,
    );

    this.router.get(
      "/:id/replacement-data",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.getOrderByIdReplacement,
    );

    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.getOrderByIdDetail,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateOrderDTO),
      this.orderController.createOrder,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateOrderDTO),
      this.orderController.updateOrder,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
