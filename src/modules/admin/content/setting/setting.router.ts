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
    this.router.get("/", this.appSettingController.getPublicSettings);

    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    this.router.use(autoVerifyPermission("app_setting"));

    this.router.get("/admin", this.appSettingController.getAdminSettings);

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
