import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { AttributeController } from "./attributes.controller";
import { CreateAttributeDTO } from "./dto/createAttributes.dto";
import { UpdateAttributeDTO } from "./dto/updateAttributes.dto";

@autoInjectable()
export class AttributeRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly attributeController: AttributeController,
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
    this.router.use(autoVerifyPermission());

    // ==========================================
    // ATTRIBUTE ROUTES
    // ==========================================

    // === GET ALL ATTRIBUTES (Otomatis butuh 'read') ===
    this.router.get("/", this.attributeController.getAllAttributes);

    // === LIST FOR DROPDOWN (Otomatis butuh 'read') ===
    this.router.get("/list", this.attributeController.getAttributeList);

    // === EXPORT EXCEL (Otomatis butuh 'read') ===
    this.router.get("/export/excel", this.attributeController.exportAttributes);

    // === CLONE ATTRIBUTE (Otomatis butuh 'create') ===
    // Catatan: Rute statis diletakkan di atas rute dinamis `/:id`
    this.router.post("/clone", this.attributeController.cloneAttribute);

    // === GET BY ID (Otomatis butuh 'read') ===
    this.router.get("/:id", this.attributeController.getAttributeById);

    // === CREATE ATTRIBUTE + VALUES (Otomatis butuh 'create') ===
    this.router.post(
      "/",
      validateBody(CreateAttributeDTO),
      this.attributeController.createAttribute,
    );

    // === UPDATE ATTRIBUTE + VALUES (Otomatis butuh 'update') ===
    this.router.patch(
      "/:id",
      validateBody(UpdateAttributeDTO),
      this.attributeController.updateAttribute,
    );

    // === DELETE ATTRIBUTE (Otomatis butuh 'delete') ===
    this.router.delete("/:id", this.attributeController.deleteAttribute);
  };

  getRouter(): Router {
    return this.router;
  }
}
