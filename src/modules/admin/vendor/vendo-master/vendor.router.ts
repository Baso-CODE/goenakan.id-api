import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { VendorController } from "./vendor.controller";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { CreateVendorDTO } from "./dto/createVendor.dto";
import { UpdateVendorDTO } from "./dto/updateVendor.dto";

@autoInjectable()
export class VendorRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly vendorController: VendorController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman dan dinamis.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // ==========================================
    // VENDOR ROUTES
    // ==========================================

    // === GET ALL VENDORS (Otomatis butuh 'read') ===
    this.router.get("/", this.vendorController.getAllVendors);

    // === EXPORT EXCEL (Otomatis butuh 'read') ===
    this.router.get("/export/excel", this.vendorController.exportVendors);

    // === ORDER ADD (Otomatis butuh 'read') ===
    this.router.get("/order/add", this.vendorController.getAllVendorsForOrder);

    // === GET BY ORDER ID (Otomatis butuh 'read') ===
    this.router.get(
      "/by-order/:orderId",
      this.vendorController.getVendorsByOrder,
    );

    // === GET VENDOR DETAIL (Otomatis butuh 'read') ===
    this.router.get("/detail/:id", this.vendorController.getVendorByIdDetail);

    // === GET BY ID (Otomatis butuh 'read') ===
    this.router.get("/:id", this.vendorController.getVendorById);

    // === CREATE VENDOR (Otomatis butuh 'create') ===
    this.router.post(
      "/",
      validateBody(CreateVendorDTO),
      this.vendorController.createVendor,
    );

    // === UPDATE VENDOR (Otomatis butuh 'update') ===
    this.router.patch(
      "/:id",
      validateBody(UpdateVendorDTO),
      this.vendorController.updateVendor,
    );

    // === DELETE VENDOR (Otomatis butuh 'delete') ===
    this.router.delete("/:id", this.vendorController.deleteVendor);
  };

  getRouter(): Router {
    return this.router;
  }
}
