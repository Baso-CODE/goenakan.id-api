import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../../middleware/nextAuth.middleware";
//  Hapus verifyRole dan gunakan autoVerifyPermission
import { autoVerifyPermission } from "../../../../../middleware/permission.middleware";
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
    // ==========================================
    // === PUBLIC ROUTES (Bebas diakses tanpa login)
    // ==========================================
    // (Untuk Dropdown di Form Artikel)
    this.router.get("/list", this.articleTagController.getTagList);

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

    this.router.get("/", this.articleTagController.getAllTags);

    this.router.get("/export/excel", this.articleTagController.exportTags);

    this.router.get("/:id", this.articleTagController.getTagById);

    // Endpoint POST tetap membutuhkan middleware validateBody untuk memvalidasi input
    this.router.post(
      "/",
      validateBody(CreateArticleTagDTO),
      this.articleTagController.createTag,
    );

    // Endpoint PATCH juga tetap membutuhkan middleware validateBody
    this.router.patch(
      "/:id",
      validateBody(UpdateArticleTagDTO),
      this.articleTagController.updateTag,
    );

    this.router.delete("/:id", this.articleTagController.deleteTag);
  };

  getRouter(): Router {
    return this.router;
  }
}
