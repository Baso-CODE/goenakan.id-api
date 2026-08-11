import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../../../middleware/role.middleware";
import { validateBody } from "../../../../../middleware/validation.middleware";
import {
  CreateArticleTagDTO,
  UpdateArticleTagDTO,
} from "../dto/tag-article.dto";
import { ArticleTagController } from "./tag-article.controller";

@autoInjectable()
export class ArticleTagRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly articleTagController: ArticleTagController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // === PUBLIC/LIST ROUTES (Untuk Dropdown di Form Artikel) ===
    this.router.get("/list", this.articleTagController.getTagList);

    // === PROTECTED ADMIN ROUTES ===
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.articleTagController.getAllTags,
    );

    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.articleTagController.exportTags,
    );

    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.articleTagController.getTagById,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      validateBody(CreateArticleTagDTO),
      this.articleTagController.createTag,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      validateBody(UpdateArticleTagDTO),
      this.articleTagController.updateTag,
    );

    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.articleTagController.deleteTag,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
