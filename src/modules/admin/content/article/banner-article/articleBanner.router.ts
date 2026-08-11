import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../../middleware/permission.middleware";
import { validateBody } from "../../../../../middleware/validation.middleware";
import {
  CreateArticleBannerDTO,
  UpdateArticleBannerDTO,
} from "../dto/articleBanner.dto";
import { ArticleBannerController } from "./articleBanner.controller";

@autoInjectable()
export class ArticleBannerRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly articleBannerController: ArticleBannerController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ====================================================================
    // 1. PUBLIC ROUTE (Bebas diakses tanpa login)
    // diletakkan di atas agar tidak bentrok dengan rute dinamis /:id
    // ====================================================================
    this.router.get(
      "/public",
      this.articleBannerController.getActiveBannersPublic,
    );

    // ====================================================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Seluruh rute di bawahnya otomatis diwajibkan login dan memiliki akses.
    // ====================================================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    // ✨ Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission());

    // ====================================================================
    // 2. ADMIN ROUTES (TERLINDUNGI OTOMATIS)
    // ====================================================================

    // Get All Banners (Pagination & Filter)
    this.router.get("/", this.articleBannerController.getAllBanners);

    // Get Banner By ID
    this.router.get("/:id", this.articleBannerController.getBannerById);

    // Create Banner (Tetap menggunakan validateBody untuk memastikan data benar)
    this.router.post(
      "/",
      validateBody(CreateArticleBannerDTO),
      this.articleBannerController.createBanner,
    );

    // Update Banner
    this.router.patch(
      "/:id",
      validateBody(UpdateArticleBannerDTO),
      this.articleBannerController.updateBanner,
    );

    // Delete Banner
    this.router.delete("/:id", this.articleBannerController.deleteBanner);
  };

  getRouter(): Router {
    return this.router;
  }
}
