import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { CrmTemplateController } from "./crmTemplate.controller";
import { CreateCrmTemplateDTO } from "./dto/createCrmTemplate.dto";
import { UpdateCrmTemplateDTO } from "./dto/updateCrmTemplate.dto";

@autoInjectable()
export class CrmTemplateRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly crmTemplateController: CrmTemplateController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Autentikasi Admin via NextAuth
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    this.router.get("/", this.crmTemplateController.getTemplates);
    this.router.post("/", validateBody(CreateCrmTemplateDTO), this.crmTemplateController.createTemplate);
    this.router.put("/:id", validateBody(UpdateCrmTemplateDTO), this.crmTemplateController.updateTemplate);
    this.router.patch("/:id", validateBody(UpdateCrmTemplateDTO), this.crmTemplateController.updateTemplate);
    this.router.delete("/:id", this.crmTemplateController.deleteTemplate);
  };

  public getRouter = (): Router => {
    return this.router;
  };
}
