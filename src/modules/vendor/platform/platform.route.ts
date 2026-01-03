import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";

import { CreateContactPlatformDTO } from "./dto/createContactPlatform.dto";
import { UpdateContactPlatformDTO } from "./dto/updateContactPlatform.dto";
import { ContactPlatformController } from "./platform.controller";

@autoInjectable()
export class ContactPlatformRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly contactPlatformController: ContactPlatformController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // === PUBLIC ROUTES ===
    this.router.get("/", this.contactPlatformController.getAllPlatforms);
    this.router.get(
      "/active",
      this.contactPlatformController.getActivePlatforms,
    );

    // === PROTECTED ROUTES ===
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.contactPlatformController.getPlatformById,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateContactPlatformDTO),
      this.contactPlatformController.createPlatform,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateContactPlatformDTO),
      this.contactPlatformController.updatePlatform,
    );

    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.contactPlatformController.deletePlatform,
    );
    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.contactPlatformController.exportContactPlatform,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
