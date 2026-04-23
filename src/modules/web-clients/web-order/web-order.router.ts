// src/modules/web-order/web-order.router.ts
import { Router } from "express";
import { injectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CancelOrderDTO } from "./dto/web-order.dto";
import { WebOrderController } from "./web-order.controller";

@injectable()
export class WebOrderRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly orderController: WebOrderController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Ambil fungsi verifikasi token JWS
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;

    // Proteksi semua route pesanan wajib login
    this.router.use(auth);

    // === Endpoint Pesanan Customer ===

    // Mengambil semua riwayat pesanan (Bisa pakai query ?status=...)
    // GET: /api/web-orders
    this.router.get("/", this.orderController.getMyOrders);

    // Mengambil detail spesifik satu pesanan
    // GET: /api/web-orders/:orderId
    this.router.get("/:orderId", this.orderController.getOrderDetail);

    // Membatalkan pesanan
    // PATCH: /api/web-orders/:orderId/cancel
    this.router.patch(
      "/:orderId/cancel",
      validateBody(CancelOrderDTO),
      this.orderController.cancelMyOrder,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
