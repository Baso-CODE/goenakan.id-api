import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { CrmSettingController } from "./crmSetting.controller";
import { UpdateCrmSettingDTO } from "./dto/updateCrmSetting.dto";

@autoInjectable()
export class CrmSettingRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly crmSettingController: CrmSettingController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Autentikasi Admin via NextAuth
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    this.router.get("/", this.crmSettingController.getSettings);
    this.router.put("/", validateBody(UpdateCrmSettingDTO), this.crmSettingController.updateSettings);
    this.router.patch("/", validateBody(UpdateCrmSettingDTO), this.crmSettingController.updateSettings);
    this.router.get("/sessions", this.crmSettingController.getSessions);
    this.router.post("/subscribe-webhook", this.crmSettingController.subscribeWebhook);
  };

  public getRouter = (): Router => {
    return this.router;
  };
}
