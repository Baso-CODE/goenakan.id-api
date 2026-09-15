import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { UserController } from "../../user/userManagement.controller";
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
    private readonly userController: UserController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // === PUBLIC ROUTES (Bebas diakses tanpa login)
    // ==========================================

    // List artikel untuk publik
    this.router.get("/list", this.articleController.getArticleListPublic);

    // GET ARTICLE BY SLUG (Untuk Tampilan User/Frontend Publik)
    this.router.get("/slug/:slug", this.articleController.getArticleBySlug);

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Mulai baris ini ke bawah, semua route wajib login & punya permission dinamis.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    //  Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission());

    // ==========================================
    // === ADMIN PROTECTED ROUTES ===
    // ==========================================

    this.router.get("/", this.articleController.getAllArticles);

    this.router.get("/authors", this.userController.getAuthorsForFilter);

    this.router.get(
      "/simple-list",
      this.articleController.getArticleSimpleList,
    );

    // ====================================================================
    // TIPTAP IMAGE UPLOAD (HARUS DI ATAS /:id)
    // ====================================================================
    this.router.post(
      "/upload-image",
      upload.single("image"),
      this.articleController.uploadTiptapImage,
    );

    // ====================================================================
    // DYNAMIC ROUTES (/:id)
    // ====================================================================
    // GET ARTICLE BY ID (Untuk Backoffice/Admin)
    this.router.get("/:id", this.articleController.getArticleById);

    // =========================================================================
    // CREATE ARTICLE
    // =========================================================================
    this.router.post(
      "/",
      upload.fields([
        { name: "coverFile", maxCount: 1 },
        { name: "coverMobileFile", maxCount: 1 },
      ]),
      this.articleController.createArticle,
    );

    // =========================================================================
    // UPDATE ARTICLE
    // =========================================================================
    this.router.patch(
      "/:id",
      upload.fields([
        { name: "coverFile", maxCount: 1 },
        { name: "coverMobileFile", maxCount: 1 },
      ]),
      this.articleController.updateArticle,
    );

    // =========================================================================
    // DELETE ARTICLE
    // =========================================================================
    this.router.delete("/:id", this.articleController.deleteArticle);
  };

  getRouter(): Router {
    return this.router;
  }
}
