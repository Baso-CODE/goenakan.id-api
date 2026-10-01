import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { ProductCategoryController } from "./categoryProduct.controller";

import multer from "multer";
import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";

const upload = multer({ storage: multer.memoryStorage() });

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
    // ==========================================
    // === PUBLIC ROUTE (Bebas diakses tanpa login)
    // ==========================================
    this.router.get(
      "/public",
      this.productCategoryController.getPublicCategories,
    );
    this.router.get("/list", this.productCategoryController.getCategoryList);

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Mulai baris ini ke bawah, semua route wajib login & punya permission dinamis.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission("product_category"));

    // ==========================================
    // === PROTECTED ROUTES ===
    // ==========================================

    // === GET ALL CATEGORIES (Otomatis butuh 'read') ===
    this.router.get("/", this.productCategoryController.getAllCategories);

    // === LIST FOR DROPDOWN (Otomatis butuh 'read') ===

    // === EXPORT EXCEL (Otomatis butuh 'read') ===
    this.router.get(
      "/export/excel",
      this.productCategoryController.exportCategoryProduct,
    );

    // === GET BY ID (Otomatis butuh 'read') ===
    this.router.get("/:id", this.productCategoryController.getCategoryById);

    // === CREATE CATEGORY (Otomatis butuh 'create') ===
    this.router.post(
      "/",
      upload.single("image"), // Memproses upload gambar kategori
      this.productCategoryController.createCategory,
    );

    // === UPDATE CATEGORY (Otomatis butuh 'update') ===
    this.router.patch(
      "/:id",
      upload.single("image"), // Memproses update gambar kategori
      this.productCategoryController.updateCategory,
    );

    // === DELETE CATEGORY (Otomatis butuh 'delete') ===
    this.router.delete("/:id", this.productCategoryController.deleteCategory);
  };

  getRouter(): Router {
    return this.router;
  }
}
