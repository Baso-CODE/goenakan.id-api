import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
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
    // === PUBLIC ROUTE ===
    // Frontend perlu mengambil ID ini untuk dipasang di <head> (Google Ads, Pixel, dll)
    this.router.get("/", this.appSettingController.getSettings);

    // === PROTECTED ROUTE (ADMIN ONLY) ===
    // Update atau Create Settings (Hanya Super Admin)
    this.router.patch(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateAppSettingDTO),
      this.appSettingController.saveSettings,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
