// src/services/popup-banner/popup-banner.router.ts

import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
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
    // ====================================================================
    // 1. PUBLIC ROUTE (Bebas diakses tanpa login)
    // ====================================================================
    this.router.get("/active", this.popupBannerController.getActive);

    // ====================================================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // ====================================================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    //  Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission("popup_banner"));

    // ====================================================================
    // 2. ADMIN ROUTES (TERLINDUNGI OTOMATIS)
    // ====================================================================

    this.router.get("/admin/list", this.popupBannerController.getAllAdmin);

    // Get By ID
    this.router.get("/:id", this.popupBannerController.getById);

    // Create Banner
    this.router.post(
      "/",
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
      upload.fields([
        { name: "desktopImage", maxCount: 1 },
        { name: "mobileImage", maxCount: 1 },
      ]),
      validateBody(UpdatePopupBannerDTO),
      this.popupBannerController.update,
    );

    // Delete Banner
    this.router.delete("/:id", this.popupBannerController.delete);
  };

  getRouter(): Router {
    return this.router;
  }
}
