import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import {
  CreateShipmentNoteCategoryDTO,
  UpdateShipmentNoteCategoryDTO,
} from "./dto/shipment-note.dto";
import { ShipmentNoteCategoryController } from "./notesShipmentCategory.controller";

@autoInjectable()
export class ShipmentNoteCategoryRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly shipmentNoteCategoryController: ShipmentNoteCategoryController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // ==========================================
    // === SHIPMENT NOTE CATEGORY ROUTES ===
    // ==========================================

    // Get All (Otomatis butuh 'read')
    this.router.get("/", this.shipmentNoteCategoryController.getAll);

    // Get One by ID (Otomatis butuh 'read')
    this.router.get("/:id", this.shipmentNoteCategoryController.getOne);

    // Create (Otomatis butuh 'create')
    this.router.post(
      "/",
      validateBody(CreateShipmentNoteCategoryDTO),
      this.shipmentNoteCategoryController.create,
    );

    // Update (Otomatis butuh 'update')
    this.router.patch(
      "/:id",
      validateBody(UpdateShipmentNoteCategoryDTO),
      this.shipmentNoteCategoryController.update,
    );

    // Delete (Otomatis butuh 'delete')
    this.router.delete("/:id", this.shipmentNoteCategoryController.delete);
  };

  getRouter(): Router {
    return this.router;
  }
}
