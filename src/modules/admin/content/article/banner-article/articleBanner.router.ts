import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../../../middleware/role.middleware";
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
    // 1. PUBLIC ROUTE (TIDAK ADA AUTH)
    // diletakkan di atas agar tidak bentrok dengan /:id
    // ====================================================================
    this.router.get(
      "/public",
      this.articleBannerController.getActiveBannersPublic,
    );

    // ====================================================================
    // 2. ADMIN ROUTES (WAJIB LOGIN & SUPER_ADMIN)
    // ====================================================================
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;
    const requireAdmin = verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]);

    // Get All Banners (Pagination & Filter)
    this.router.get(
      "/",
      auth,
      requireAdmin,
      this.articleBannerController.getAllBanners,
    );

    // Get Banner By ID
    this.router.get(
      "/:id",
      auth,
      requireAdmin,
      this.articleBannerController.getBannerById,
    );

    // Create Banner
    this.router.post(
      "/",
      auth,
      requireAdmin,
      validateBody(CreateArticleBannerDTO),
      this.articleBannerController.createBanner,
    );

    // Update Banner
    this.router.patch(
      "/:id",
      auth,
      requireAdmin,
      validateBody(UpdateArticleBannerDTO),
      this.articleBannerController.updateBanner,
    );

    // Delete Banner
    this.router.delete(
      "/:id",
      auth,
      requireAdmin,
      this.articleBannerController.deleteBanner,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
