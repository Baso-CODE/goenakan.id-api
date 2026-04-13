import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { ArticleController } from "./article.controller";

// Konfigurasi Multer (menggunakan memory storage karena akan di-upload ke Cloudinary)
const upload = multer({ storage: multer.memoryStorage() });

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
    const requiredRole = ["SUPER_ADMIN"];

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
    // Note: Pastikan prefix endpoint di frontend berbeda agar tidak bentrok dengan /:id
    // Contoh di frontend: fetch(`/api/articles/slug/cara-membuat-baju`)
    this.router.get("/slug/:slug", this.articleController.getArticleBySlug);

    // CREATE ARTICLE
    this.router.post(
      "/",
      auth,
      verifyRole(requiredRole),
      upload.single("coverFile"), // Frontend mengirim gambar cover dengan field "coverFile"
      // validateBody(CreateArticleDTO), // Aktifkan jika DTO sudah support FormData (Lihat catatan di bawah)
      this.articleController.createArticle,
    );

    // UPDATE ARTICLE
    this.router.patch(
      "/:id",
      auth,
      verifyRole(requiredRole),
      upload.single("coverFile"),
      // validateBody(UpdateArticleDTO),
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
