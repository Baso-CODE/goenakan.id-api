import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
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
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission("material_type"));

    // ==========================================
    // === PROTECTED ROUTES: Management ===
    // ==========================================

    // Get list untuk dropdown (Catatan: Rute statis diletakkan di atas rute dinamis `/:id`)
    this.router.get("/list", this.materialTypeController.getMaterialList);

    // Get all dengan pagination & search (Otomatis butuh 'read')
    this.router.get("/", this.materialTypeController.getAllMaterialTypes);

    // Export data ke Excel (Otomatis butuh 'read')
    this.router.get(
      "/export/excel",
      this.materialTypeController.exportMaterialTypes,
    );

    // Get by ID (Otomatis butuh 'read')
    this.router.get("/:id", this.materialTypeController.getMaterialTypeById);

    // Create New Material (Otomatis butuh 'create')
    this.router.post(
      "/",
      validateBody(CreateMaterialTypeDTO),
      this.materialTypeController.createMaterialType,
    );

    // Update Material (Otomatis butuh 'update')
    this.router.patch(
      "/:id",
      validateBody(UpdateMaterialTypeDTO),
      this.materialTypeController.updateMaterialType,
    );

    // Delete Material (Otomatis butuh 'delete')
    this.router.delete("/:id", this.materialTypeController.deleteMaterialType);
  };

  getRouter(): Router {
    return this.router;
  }
}
