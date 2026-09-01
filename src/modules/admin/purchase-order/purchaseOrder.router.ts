import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware"; //  Import auto middleware
import { validateBody } from "../../../middleware/validation.middleware";
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
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang ini SATU KALI saja di sini! Semua route di bawahnya akan otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // ==========================================
    // GET ALL PURCHASE ORDERS (Otomatis dicek 'read_purchase_orders')
    // ==========================================
    this.router.get("/all", this.purchaseOrderController.getAllPurchaseOrders);

    // ==========================================
    // GET PURCHASE ORDER BY ID (Otomatis dicek 'read_purchase_orders')
    // ==========================================
    this.router.get("/:id", this.purchaseOrderController.getPurchaseOrderById);

    // ==========================================
    // CREATE PURCHASE ORDER (Otomatis dicek 'create_purchase_orders')
    // ==========================================
    this.router.post(
      "/",
      validateBody(CreatePurchaseOrderDTO),
      this.purchaseOrderController.createPurchaseOrder,
    );

    // ==========================================
    // UPDATE PURCHASE ORDER (Otomatis dicek 'update_purchase_orders')
    // ==========================================
    this.router.patch(
      "/:id",
      validateBody(UpdatePurchaseOrderDTO),
      this.purchaseOrderController.updatePurchaseOrder,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
