import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { BrandClientController } from "./brandClient.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

@autoInjectable()
export class BrandClientRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly brandClientController: BrandClientController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // 1. PUBLIC ROUTES (Tanpa Autentikasi)
    // ==========================================

    // GET /api/brand-clients/public
    this.router.get("/public", this.brandClientController.getPublicClients);

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    // ✨ Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission());

    // ==========================================
    // 2. ADMIN ROUTES (Otomatis Terlindungi)
    // ==========================================

    // GET ALL CLIENTS (With Pagination)
    this.router.get("/", this.brandClientController.getAllBrandClients);

    // GET BY ID
    this.router.get("/:id", this.brandClientController.getBrandClientById);

    // CREATE BRAND CLIENT
    this.router.post(
      "/",
      upload.single("logo"),
      this.brandClientController.createBrandClient,
    );

    // UPDATE BRAND CLIENT
    this.router.patch(
      "/:id",
      upload.single("logo"),
      this.brandClientController.updateBrandClient,
    );

    // DELETE BRAND CLIENT
    this.router.delete("/:id", this.brandClientController.deleteBrandClient);
  };

  getRouter(): Router {
    return this.router;
  }
}
