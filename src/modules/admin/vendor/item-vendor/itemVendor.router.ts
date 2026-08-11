import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { CreateVendorItemDTO } from "./dto/createItemVendor.dto";
import { UpdateVendorItemDTO } from "./dto/updateItemVendor.dto";
import { ItemVendorController } from "./itemVendor.controller";

@autoInjectable()
export class ItemVendorRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly itemVendorController: ItemVendorController,
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
    // ITEM VENDOR ROUTES
    // ==========================================

    // === GET ALL ITEMS (Otomatis butuh 'read') ===
    this.router.get("/", this.itemVendorController.getAllItems);

    // === GET ACTIVE ITEMS (Otomatis butuh 'read') ===
    this.router.get("/active", this.itemVendorController.getActiveItems);

    // === EXPORT EXCEL (Otomatis butuh 'read') ===
    this.router.get("/export/excel", this.itemVendorController.exportItems);

    // === GET BY ID (Otomatis butuh 'read') ===
    this.router.get("/:id", this.itemVendorController.getItemById);

    // === CREATE ITEM (Otomatis butuh 'create') ===
    this.router.post(
      "/",
      validateBody(CreateVendorItemDTO),
      this.itemVendorController.createItem,
    );

    // === UPDATE ITEM (Otomatis butuh 'update') ===
    this.router.patch(
      "/:id",
      validateBody(UpdateVendorItemDTO),
      this.itemVendorController.updateItem,
    );

    // === DELETE ITEM (Otomatis butuh 'delete') ===
    this.router.delete("/:id", this.itemVendorController.deleteItem);
  };

  getRouter(): Router {
    return this.router;
  }
}
