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
    // 1. Static Routes (Harus diatas dynamic :id)
    this.router.get(
      "/all",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.getAllOrder,
    );

    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.exportOrders,
    );

    // 2. Dynamic Routes (Order By ID)

    // === [NEW ROUTE] KHUSUS TRACKING ===
    // URL: http://localhost:8000/orders/:id/tracking
    this.router.get(
      "/:id/tracking",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.getForTracking, // <--- Pastikan method ini ada di Controller
    );
    // ===================================

    this.router.get(
      "/:id/edit-data",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.orderController.getOrderByIdUpdate,
    );

    // Route Generic /:id sebaiknya ditaruh paling bawah di antara route GET :id lainnya
    // agar tidak menimpa route spesifik seperti /:id/tracking
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
