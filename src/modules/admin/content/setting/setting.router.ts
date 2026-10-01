import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { UpdateAppSettingDTO } from "./dto/setting.dto";
import { AppSettingController } from "./setting.controller";

@autoInjectable()
export class AppSettingRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly appSettingController: AppSettingController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // === PUBLIC ROUTE (Tanpa Autentikasi)
    // ==========================================
    // Frontend perlu mengambil ID ini untuk dipasang di <head> (Google Ads, Pixel, dll)
    this.router.get("/", this.appSettingController.getSettings);

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    //  Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission("app_setting"));

    // ==========================================
    // === PROTECTED ROUTE (ADMIN ONLY) (Otomatis Terlindungi)
    // ==========================================
    // Update atau Create Settings
    this.router.patch(
      "/",
      validateBody(UpdateAppSettingDTO),
      this.appSettingController.saveSettings,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
