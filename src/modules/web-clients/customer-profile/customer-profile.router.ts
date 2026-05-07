// src/modules/customer-profile/customer-profile.router.ts
import { Router } from "express";
import { injectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CustomerProfileController } from "./customer-profile.controller";
import { UpdateCustomerProfileDTO } from "./dto/customer-profile.dto";

@injectable()
export class CustomerProfileRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly profileController: CustomerProfileController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;

    this.router.use(auth);

    // === Endpoint Profil Customer ===

    // Mengambil data pro fil diri sendiri (B2C/B2B)
    // GET: /api/customer-profile/me
    this.router.get("/me", this.profileController.getMe);

    // PATCH: /api/customer-profile/update
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
