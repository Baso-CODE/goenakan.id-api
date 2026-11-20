import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { CrmStatusController } from "./crmStatus.controller";
import { CreateCrmStatusDTO } from "./dto/createCrmStatus.dto";
import { UpdateCrmStatusDTO } from "./dto/updateCrmStatus.dto";

@autoInjectable()
export class CrmStatusRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly crmStatusController: CrmStatusController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Autentikasi Admin via NextAuth
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    this.router.get("/", this.crmStatusController.getStatuses);
    this.router.post("/", validateBody(CreateCrmStatusDTO), this.crmStatusController.createStatus);
    this.router.put("/reorder", this.crmStatusController.reorderStatuses);
    this.router.put("/:id", validateBody(UpdateCrmStatusDTO), this.crmStatusController.updateStatus);
    this.router.patch("/:id", validateBody(UpdateCrmStatusDTO), this.crmStatusController.updateStatus);
    this.router.delete("/:id", this.crmStatusController.deleteStatus);
  };

  public getRouter = (): Router => {
    return this.router;
  };
}
