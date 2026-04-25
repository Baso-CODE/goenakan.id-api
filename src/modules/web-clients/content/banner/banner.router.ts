// src/services/popup-banner/popup-banner.router.ts

import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../../middleware/role.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { PopupBannerController } from "./banner.controller";
import { CreatePopupBannerDTO, UpdatePopupBannerDTO } from "./dto/banner.dto";

const upload = multer({ storage: multer.memoryStorage() });

@autoInjectable()
export class PopupBannerRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly popupBannerController: PopupBannerController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get("/active", this.popupBannerController.getActive);

    this.router.get(
      "/admin/list",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.popupBannerController.getAllAdmin,
    );

    // Get By ID
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.popupBannerController.getById,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      upload.fields([
        { name: "desktopImage", maxCount: 1 },
        { name: "mobileImage", maxCount: 1 },
      ]),
      validateBody(CreatePopupBannerDTO),
      this.popupBannerController.create,
    );

    // Update Banner
    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      upload.fields([
        { name: "desktopImage", maxCount: 1 },
        { name: "mobileImage", maxCount: 1 },
      ]),
      validateBody(UpdatePopupBannerDTO),
      this.popupBannerController.update,
    );

    // Delete Banner
    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.popupBannerController.delete,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
