import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
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
    // === PUBLIC ROUTE: Get All Active Categories ===
    this.router.get("/", this.vendorCategoryController.getAllCategories);
    this.router.get(
      "/active",
      this.vendorCategoryController.getActiveCategories,
    );

    // === PROTECTED ROUTES ===
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.vendorCategoryController.getCategoryById,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateVendorCategoryDTO),
      this.vendorCategoryController.createCategory,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateVendorCategoryDTO),
      this.vendorCategoryController.updateCategory,
    );

    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.vendorCategoryController.deleteCategory,
    );

    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.vendorCategoryController.exportCategories,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
