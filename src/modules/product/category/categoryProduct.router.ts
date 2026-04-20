import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { ProductCategoryController } from "./categoryProduct.controller";

import multer from "multer";
const upload = multer({ storage: multer.memoryStorage() });
@autoInjectable()
@autoInjectable()
export class ProductCategoryRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly productCategoryController: ProductCategoryController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;
    const adminRole = verifyRole(["SUPER_ADMIN"]);

    // === PUBLIC ROUTE: Get All Active Categories ===
    this.router.get(
      "/public",
      this.productCategoryController.getPublicCategories,
    );

    // === PROTECTED ROUTES ===
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productCategoryController.getAllCategories,
    );
    this.router.get("/list", this.productCategoryController.getCategoryList);

    // === PROTECTED ROUTES ===
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productCategoryController.getCategoryById,
    );

    this.router.post(
      "/",
      auth,
      adminRole,
      upload.single("image"),
      this.productCategoryController.createCategory,
    );
    this.router.patch(
      "/:id",
      auth,
      adminRole,
      upload.single("image"),
      this.productCategoryController.updateCategory,
    );

    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productCategoryController.deleteCategory,
    );

    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productCategoryController.exportCategoryProduct,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
