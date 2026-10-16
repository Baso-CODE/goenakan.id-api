import { Router } from "express";
import { injectable } from "tsyringe";
import { PublicAuthMiddleware } from "../../../middleware/publicAuth.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CustomerProfileController } from "./customer-profile.controller";
import { UpdateCustomerProfileDTO } from "./dto/customer-profile.dto";

@injectable()
export class CustomerProfileRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly profileController: CustomerProfileController,
    private readonly publicAuthMiddleware: PublicAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    const auth = this.publicAuthMiddleware.verifyPublicToken;

    this.router.use(auth);

    this.router.get("/me", this.profileController.getMe);

    this.router.patch(
      "/update",
      validateBody(UpdateCustomerProfileDTO),
      this.profileController.updateMe,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
