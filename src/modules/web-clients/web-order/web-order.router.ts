import { NextFunction, Request, Response, Router } from "express";
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
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;

    const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
      if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer ")
      ) {
        return auth(req, res, next);
      }
      next();
    };
    // ==========================================================
    // 🌍 ENDPOINT PUBLIK (Bisa Diakses Tanpa Login / Guest)
    // ==========================================================

    this.router.post("/", optionalAuth, this.orderController.createOrder);

    this.router.post(
      "/:orderId/pay",
      optionalAuth,
      this.orderController.createPayment,
    );
    this.router.post("/webhook/midtrans", this.orderController.midtransWebhook);

    // ==========================================================
    // 🔒 ENDPOINT PRIVAT (Wajib Login)
    // ==========================================================

    this.router.get("/", auth, this.orderController.getMyOrders);

    this.router.get("/:orderId", auth, this.orderController.getOrderDetail);

    this.router.patch(
      "/:orderId/cancel",
      auth,
      validateBody(CancelOrderDTO),
      this.orderController.cancelMyOrder,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
