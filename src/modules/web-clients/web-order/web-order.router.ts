import { NextFunction, Request, Response, Router } from "express";
import { injectable } from "tsyringe";
import { PublicAuthMiddleware } from "../../../middleware/publicAuth.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CancelOrderDTO } from "./dto/web-order.dto";
import { WebOrderController } from "./web-order.controller";

@injectable()
export class WebOrderRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly orderController: WebOrderController,
    private readonly publicAuthMiddleware: PublicAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    const auth = this.publicAuthMiddleware.verifyPublicToken;

    const optionalAuth = (
      req: Request,
      res: Response,
      next: NextFunction,
    ): void => {
      const authorization = req.headers.authorization;

      if (authorization?.startsWith("Bearer ")) {
        void auth(req, res, next);
        return;
      }

      next();
    };

    this.router.post("/webhook/midtrans", this.orderController.midtransWebhook);

    this.router.post("/", optionalAuth, this.orderController.createOrder);

    this.router.post(
      "/:orderId/pay",
      optionalAuth,
      this.orderController.createPayment,
    );

    this.router.get(
      "/:orderId",
      optionalAuth,
      this.orderController.getOrderDetail,
    );

    this.router.get("/", auth, this.orderController.getMyOrders);

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
