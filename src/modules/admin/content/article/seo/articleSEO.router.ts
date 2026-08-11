import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../../middleware/permission.middleware";
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
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    // ✨ Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission());

    // ====================================================================
    // DYNAMIC ROUTES FOR ARTICLE SEO (/:articleId)
    // ====================================================================

    // 1. GET SEO BY ARTICLE ID (Untuk mengisi form di Backoffice/Admin)
    this.router.get("/:articleId", this.articleSeoController.getSeoByArticleId);

    // 2. UPSERT ARTICLE SEO (Create jika baru, Update jika sudah ada)
    this.router.post("/:articleId", this.articleSeoController.upsertArticleSeo);

    // 3. DELETE ARTICLE SEO (Opsional jika ingin hapus manual)
    this.router.delete(
      "/:articleId",
      this.articleSeoController.deleteArticleSeo,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
