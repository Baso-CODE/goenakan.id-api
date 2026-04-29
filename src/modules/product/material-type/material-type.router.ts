import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import {
  CreateMaterialTypeDTO,
  UpdateMaterialTypeDTO,
} from "./dto/material-type.dto";
import { MaterialTypeController } from "./material-type.controller";

@autoInjectable()
export class MaterialTypeRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly materialTypeController: MaterialTypeController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;
    const adminRole = verifyRole(["SUPER_ADMIN"]);

    // === PROTECTED ROUTES: Management ===

    // Get list untuk dropdown (Bisa diakses admin mana saja/tanpa pagination berat)
    this.router.get("/list", auth, this.materialTypeController.getMaterialList);

    // Get all dengan pagination & search
    this.router.get(
      "/",
      auth,
      adminRole,
      this.materialTypeController.getAllMaterialTypes,
    );

    // Export data ke Excel
    this.router.get(
      "/export/excel",
      auth,
      adminRole,
      this.materialTypeController.exportMaterialTypes,
    );

    // Get by ID
    this.router.get(
      "/:id",
      auth,
      adminRole,
      this.materialTypeController.getMaterialTypeById,
    );

    // Create New Material
    this.router.post(
      "/",
      auth,
      adminRole,
      validateBody(CreateMaterialTypeDTO),
      this.materialTypeController.createMaterialType,
    );

    // Update Material
    this.router.patch(
      "/:id",
      auth,
      adminRole,
      validateBody(UpdateMaterialTypeDTO),
      this.materialTypeController.updateMaterialType,
    );

    // Delete Material
    this.router.delete(
      "/:id",
      auth,
      adminRole,
      this.materialTypeController.deleteMaterialType,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
