// src/services/hero/hero.router.ts

import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { CreateHeroSlideDTO, UpdateHeroSlideDTO } from "./dto/hero.dto";
import { HeroController } from "./hero.controller";

const upload = multer({ storage: multer.memoryStorage() });

@autoInjectable()
export class HeroRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly heroController: HeroController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // === PUBLIC ROUTE (Tanpa Autentikasi)
    // ==========================================
    this.router.get("/", this.heroController.getAllPublic);

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

    // Get All (Table Admin)
    this.router.get("/admin/list", this.heroController.getAllAdmin);

    // Get By ID
    this.router.get("/:id", this.heroController.getById);

    // Create Slide
    this.router.post(
      "/",
      upload.single("image"),
      validateBody(CreateHeroSlideDTO),
      this.heroController.create,
    );

    // Update Slide
    this.router.patch(
      "/:id",
      upload.single("image"),
      validateBody(UpdateHeroSlideDTO),
      this.heroController.update,
    );

    // Delete Slide
    this.router.delete("/:id", this.heroController.delete);
  };

  getRouter(): Router {
    return this.router;
  }
}
