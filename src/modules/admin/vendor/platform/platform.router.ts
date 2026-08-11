import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
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
    // ==========================================
    // === PUBLIC ROUTES (Bebas diakses tanpa login)
    // ==========================================
    this.router.get("/", this.contactPlatformController.getAllPlatforms);
    this.router.get(
      "/active",
      this.contactPlatformController.getActivePlatforms,
    );

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Mulai baris ini ke bawah, semua route wajib login & punya permission dinamis.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // ==========================================
    // === PROTECTED ROUTES ===
    // ==========================================

    // === EXPORT EXCEL (Otomatis butuh 'read') ===
    this.router.get(
      "/export/excel",
      this.contactPlatformController.exportContactPlatform,
    );

    // === GET BY ID (Otomatis butuh 'read') ===
    this.router.get("/:id", this.contactPlatformController.getPlatformById);

    // === CREATE PLATFORM (Otomatis butuh 'create') ===
    this.router.post(
      "/",
      validateBody(CreateContactPlatformDTO),
      this.contactPlatformController.createPlatform,
    );

    // === UPDATE PLATFORM (Otomatis butuh 'update') ===
    this.router.patch(
      "/:id",
      validateBody(UpdateContactPlatformDTO),
      this.contactPlatformController.updatePlatform,
    );

    // === DELETE PLATFORM (Otomatis butuh 'delete') ===
    this.router.delete("/:id", this.contactPlatformController.deletePlatform);
  };

  getRouter(): Router {
    return this.router;
  }
}
