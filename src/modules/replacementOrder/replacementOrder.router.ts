import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import {
  CreateReplacementOrderDTO,
  UpdateReplacementOrderDTO,
} from "./dto/replacement-order.dto";
import { ReplacementOrderController } from "./replacementOrder.controller";

@autoInjectable()
export class ReplacementOrderRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly replacementOrderController: ReplacementOrderController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // 1. GET ALL REPLACEMENT ORDERS
    this.router.get(
      "/all",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.replacementOrderController.getAllReplacementOrders,
    );

    // 2. CREATE REPLACEMENT ORDER
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateReplacementOrderDTO),
      this.replacementOrderController.createReplacementOrder,
    );

    // 3. UPDATE REPLACEMENT ORDER
    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateReplacementOrderDTO),
      this.replacementOrderController.updateReplacementOrder,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
