import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../../../middleware/role.middleware";
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
    // === PUBLIC/LIST ROUTES ===
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.articleCategoryController.getAllCategories,
    );

    this.router.get("/list", this.articleCategoryController.getCategoryList);

    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.articleCategoryController.exportCategory,
    );

    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.articleCategoryController.getCategoryById,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      validateBody(CreateArticleCategoryDTO),
      this.articleCategoryController.createCategory,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      validateBody(UpdateArticleCategoryDTO),
      this.articleCategoryController.updateCategory,
    );

    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.articleCategoryController.deleteCategory,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
