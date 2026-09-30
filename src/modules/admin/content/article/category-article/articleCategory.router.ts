import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../../middleware/permission.middleware";
import { validateBody } from "../../../../../middleware/validation.middleware";
import {
  CreateArticleCategoryDTO,
  UpdateArticleCategoryDTO,
} from "../dto/articleCategory.dto";
import { ArticleCategoryController } from "./articleCategory.controller";

@autoInjectable()
export class ArticleCategoryRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly articleCategoryController: ArticleCategoryController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // === PUBLIC ROUTES (Bebas diakses tanpa login)
    // ==========================================
    // Endpoint untuk list dropdown kategori di form
    this.router.get("/list", this.articleCategoryController.getCategoryList);

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    //  Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL (misal: category_article)
    this.router.use(autoVerifyPermission("article_category"));

    // ==========================================
    // === ADMIN PROTECTED ROUTES ===
    // ==========================================

    this.router.get("/", this.articleCategoryController.getAllCategories);

    this.router.get(
      "/export/excel",
      this.articleCategoryController.exportCategory,
    );

    this.router.get("/:id", this.articleCategoryController.getCategoryById);

    // Tetap gunakan validateBody untuk memastikan data yang dikirim user sesuai standar DTO
    this.router.post(
      "/",
      validateBody(CreateArticleCategoryDTO),
      this.articleCategoryController.createCategory,
    );

    this.router.patch(
      "/:id",
      validateBody(UpdateArticleCategoryDTO),
      this.articleCategoryController.updateCategory,
    );

    this.router.delete("/:id", this.articleCategoryController.deleteCategory);
  };

  getRouter(): Router {
    return this.router;
  }
}
