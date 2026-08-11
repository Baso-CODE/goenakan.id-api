import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { VendorCategoryController } from "./categoryVendor.controller";
import { CreateVendorCategoryDTO } from "./dto/createCategoryVendor.dto";
import { UpdateVendorCategoryDTO } from "./dto/updateCategoryVendor.dto";

@autoInjectable()
export class VendorCategoryRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly vendorCategoryController: VendorCategoryController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // === PUBLIC ROUTES (Bebas diakses tanpa login)
    // ==========================================
    this.router.get("/", this.vendorCategoryController.getAllCategories);
    this.router.get(
      "/active",
      this.vendorCategoryController.getActiveCategories,
    );

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Mulai baris ini ke bawah, semua route wajib login & punya permission dinamis.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // ==========================================
    // === PROTECTED ROUTES ===
    // ==========================================

    // === EXPORT EXCEL (Otomatis butuh 'read') ===
    this.router.get(
      "/export/excel",
      this.vendorCategoryController.exportCategories,
    );

    // === GET BY ID (Otomatis butuh 'read') ===
    this.router.get("/:id", this.vendorCategoryController.getCategoryById);

    // === CREATE CATEGORY (Otomatis butuh 'create') ===
    this.router.post(
      "/",
      validateBody(CreateVendorCategoryDTO),
      this.vendorCategoryController.createCategory,
    );

    // === UPDATE CATEGORY (Otomatis butuh 'update') ===
    this.router.patch(
      "/:id",
      validateBody(UpdateVendorCategoryDTO),
      this.vendorCategoryController.updateCategory,
    );

    // === DELETE CATEGORY (Otomatis butuh 'delete') ===
    this.router.delete("/:id", this.vendorCategoryController.deleteCategory);
  };

  getRouter(): Router {
    return this.router;
  }
}
