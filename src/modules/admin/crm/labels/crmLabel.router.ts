import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { CrmLabelController } from "./crmLabel.controller";
import { CreateCrmLabelDTO } from "./dto/createCrmLabel.dto";
import { UpdateCrmLabelDTO } from "./dto/updateCrmLabel.dto";

@autoInjectable()
export class CrmLabelRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly crmLabelController: CrmLabelController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Autentikasi Admin via NextAuth
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    this.router.get("/", this.crmLabelController.getLabels);
    this.router.post("/", validateBody(CreateCrmLabelDTO), this.crmLabelController.createLabel);
    this.router.put("/:id", validateBody(UpdateCrmLabelDTO), this.crmLabelController.updateLabel);
    this.router.patch("/:id", validateBody(UpdateCrmLabelDTO), this.crmLabelController.updateLabel);
    this.router.delete("/:id", this.crmLabelController.deleteLabel);
  };

  public getRouter = (): Router => {
    return this.router;
  };
}
