// src/services/client-logo/client-logo.router.ts

import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
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
    // ==========================================
    // === PUBLIC ROUTE (Tanpa Autentikasi)
    // ==========================================
    // Endpoint untuk ditampilkan di Website (Partner/Client Section)
    this.router.get("/", this.clientLogoController.getAllPublic);

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    // ✨ Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission());

    // ==========================================
    // === ADMIN ROUTES (Otomatis Terlindungi)
    // ==========================================

    // Get All (Table Admin with Pagination & Filter)
    this.router.get("/admin/list", this.clientLogoController.getAllAdmin);

    // Get By ID
    this.router.get("/:id", this.clientLogoController.getById);

    // Create Logo
    this.router.post(
      "/",
      upload.single("image"),
      validateBody(CreateClientLogoDTO),
      this.clientLogoController.create,
    );

    // Update Logo
    this.router.patch(
      "/:id",
      upload.single("image"),
      validateBody(UpdateClientLogoDTO),
      this.clientLogoController.update,
    );

    // Delete Logo
    this.router.delete("/:id", this.clientLogoController.delete);
  };

  getRouter(): Router {
    return this.router;
  }
}
