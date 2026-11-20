import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { CustomCodeController } from "./customCode.controller";
import { CreateCustomCodeDTO } from "./dto/createCustomCode.dto";
import { UpdateCustomCodeDTO } from "./dto/updateCustomCode.dto";

@autoInjectable()
export class CustomCodeRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly customCodeController: CustomCodeController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Autentikasi Admin via NextAuth
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    this.router.get("/", this.customCodeController.getAll);
    this.router.get("/:id", this.customCodeController.getById);
    this.router.post("/", validateBody(CreateCustomCodeDTO), this.customCodeController.create);
    this.router.patch("/:id", validateBody(UpdateCustomCodeDTO), this.customCodeController.update);
    this.router.delete("/:id", this.customCodeController.delete);
  };

  public getRouter = (): Router => {
    return this.router;
  };
}
