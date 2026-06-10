import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { CreatePurchaseOrderDTO } from "./dto/createPurchaseOrder.dto";
import { UpdatePurchaseOrderDTO } from "./dto/updatePurchaseOrder.dto";
import { PurchaseOrderController } from "./purchaseOrder.controller";

@autoInjectable()
export class PurchaseOrderRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly purchaseOrderController: PurchaseOrderController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // GET ALL PURCHASE ORDERS
    // ==========================================
    this.router.get(
      "/all",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.purchaseOrderController.getAllPurchaseOrders,
    );

    // ==========================================
    // GET PURCHASE ORDER BY ID
    // ==========================================
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.purchaseOrderController.getPurchaseOrderById,
    );

    // ==========================================
    // CREATE PURCHASE ORDER
    // ==========================================
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreatePurchaseOrderDTO),
      this.purchaseOrderController.createPurchaseOrder,
    );

    // ==========================================
    // UPDATE PURCHASE ORDER
    // ==========================================
    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdatePurchaseOrderDTO),
      this.purchaseOrderController.updatePurchaseOrder,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
