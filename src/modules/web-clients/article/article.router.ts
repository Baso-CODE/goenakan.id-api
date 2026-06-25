import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { ArticleController } from "./article.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});
@autoInjectable()
export class ArticleRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly articleController: ArticleController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // === AUTH & ROLE SETUP ===
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;
    const requiredRole = ["SUPER_ADMIN", "ADMIN_ARTICLE"];

    // ====================================================================
    // 1. PUBLIC / LIST ROUTES
    // ====================================================================

    // GET ARTICLE LIST (Tanpa Autentikasi, untuk tampilan publik seperti homepage) --- IGNORE ---
    this.router.get("/list", this.articleController.getArticleList);

    // GET ALL ARTICLES (Pagination & Filter)
    this.router.get(
      "/",
      auth,
      verifyRole(requiredRole),
      this.articleController.getAllArticles,
    );

    // ====================================================================
    // 2. TIPTAP IMAGE UPLOAD (HARUS DI ATAS /:id)
    // ====================================================================

    // Upload image directly from Tiptap Editor
    this.router.post(
      "/upload-image",
      auth,
      verifyRole(requiredRole),
      upload.single("image"),
      this.articleController.uploadTiptapImage,
    );

    // ====================================================================
    // 3. DYNAMIC ROUTES (/:id atau /:slug)
    // ====================================================================

    // GET ARTICLE BY ID (Untuk Backoffice/Admin)
    this.router.get(
      "/:id",
      auth,
      verifyRole(requiredRole),
      this.articleController.getArticleById,
    );

    // GET ARTICLE BY SLUG (Untuk Tampilan User/Frontend Publik)
    this.router.get("/slug/:slug", this.articleController.getArticleBySlug);

    // =========================================================================
    // CREATE ARTICLE
    // =========================================================================
    this.router.post(
      "/",
      auth,
      verifyRole(requiredRole),
      upload.fields([
        { name: "coverFile", maxCount: 1 },
        { name: "coverMobileFile", maxCount: 1 },
      ]),
      this.articleController.createArticle,
    );

    // =========================================================================
    // UPDATE ARTICLE (Pastikan kamu memperbarui rute ini juga ya!)
    // =========================================================================
    this.router.patch(
      "/:id",
      auth,
      verifyRole(requiredRole),
      upload.fields([
        { name: "coverFile", maxCount: 1 },
        { name: "coverMobileFile", maxCount: 1 },
      ]),
      this.articleController.updateArticle,
    );
    // DELETE ARTICLE
    this.router.delete(
      "/:id",
      auth,
      verifyRole(requiredRole),
      this.articleController.deleteArticle,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
