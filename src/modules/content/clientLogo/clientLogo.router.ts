// src/services/client-logo/client-logo.router.ts

import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { ClientLogoController } from "./clientLogo.controller";
import { CreateClientLogoDTO, UpdateClientLogoDTO } from "./dto/clientLogo.dto";

const upload = multer({ storage: multer.memoryStorage() });

@autoInjectable()
export class ClientLogoRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly clientLogoController: ClientLogoController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // === PUBLIC ROUTE ===
    // Endpoint untuk ditampilkan di Website (Partner/Client Section)
    this.router.get("/", this.clientLogoController.getAllPublic);

    // === PROTECTED ROUTES (ADMIN) ===

    // Get All (Table Admin with Pagination & Filter)
    this.router.get(
      "/admin/list",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.clientLogoController.getAllAdmin,
    );

    // Get By ID
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.clientLogoController.getById,
    );

    // Create Logo
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      upload.single("image"),
      validateBody(CreateClientLogoDTO),
      this.clientLogoController.create,
    );

    // Update Logo
    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      upload.single("image"),
      validateBody(UpdateClientLogoDTO),
      this.clientLogoController.update,
    );

    // Delete Logo
    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.clientLogoController.delete,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
