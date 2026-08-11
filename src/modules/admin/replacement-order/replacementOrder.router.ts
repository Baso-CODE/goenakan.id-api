import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
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
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission di sini satu kali saja.
    // Seluruh route di bawahnya otomatis diatur hak aksesnya.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // ==========================================
    // 1. GET ALL REPLACEMENT ORDERS (Otomatis butuh 'read')
    // ==========================================
    this.router.get(
      "/all",
      this.replacementOrderController.getAllReplacementOrders,
    );

    // ==========================================
    // 2. GET BY ID (Otomatis butuh 'read')
    // ==========================================
    this.router.get(
      "/:id",
      this.replacementOrderController.getReplacementOrderById,
    );

    // ==========================================
    // 3. CREATE REPLACEMENT ORDER (Otomatis butuh 'create')
    // ==========================================
    this.router.post(
      "/",
      validateBody(CreateReplacementOrderDTO),
      this.replacementOrderController.createReplacementOrder,
    );

    // ==========================================
    // 4. UPDATE REPLACEMENT ORDER (Otomatis butuh 'update')
    // ==========================================
    this.router.patch(
      "/:id",
      validateBody(UpdateReplacementOrderDTO),
      this.replacementOrderController.updateReplacementOrder,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
