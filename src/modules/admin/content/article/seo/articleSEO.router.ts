import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../../../middleware/role.middleware";
import { ArticleSeoController } from "./articleSEO.controller";

@autoInjectable()
export class ArticleSeoRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly articleSeoController: ArticleSeoController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // === AUTH & ROLE SETUP ===
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;
    // Mengizinkan SUPER_ADMIN untuk mengelola SEO
    const requiredRole = ["SUPER_ADMIN", "ADMIN_ARTICLE"];

    // ====================================================================
    // DYNAMIC ROUTES FOR ARTICLE SEO (/:articleId)
    // Asumsi: Router ini di-mount dengan prefix `/api/article-seo` di App
    // ====================================================================

    // 1. GET SEO BY ARTICLE ID (Untuk mengisi form di Backoffice/Admin)
    this.router.get(
      "/:articleId",
      auth,
      verifyRole(requiredRole),
      this.articleSeoController.getSeoByArticleId,
    );

    // 2. UPSERT ARTICLE SEO (Create jika baru, Update jika sudah ada)
    this.router.post(
      "/:articleId",
      auth,
      verifyRole(requiredRole),
      this.articleSeoController.upsertArticleSeo,
    );

    // 3. DELETE ARTICLE SEO (Opsional jika ingin hapus manual)
    this.router.delete(
      "/:articleId",
      auth,
      verifyRole(requiredRole),
      this.articleSeoController.deleteArticleSeo,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
