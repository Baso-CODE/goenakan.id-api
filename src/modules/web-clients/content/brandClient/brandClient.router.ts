import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../../middleware/role.middleware";
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
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;
    const adminRole = verifyRole(["SUPER_ADMIN"]);

    // ==========================================
    // 1. PUBLIC ROUTES (Tanpa Autentikasi)
    // ==========================================

    // GET /api/brand-clients/public
    this.router.get("/public", this.brandClientController.getPublicClients);

    // ==========================================
    // 2. ADMIN ROUTES (Gunakan Auth & Role)
    // ==========================================

    // GET ALL CLIENTS (With Pagination)
    this.router.get(
      "/",
      auth,
      adminRole,
      this.brandClientController.getAllBrandClients,
    );

    // GET BY ID
    this.router.get(
      "/:id",
      auth,
      adminRole,
      this.brandClientController.getBrandClientById,
    );

    // CREATE BRAND CLIENT
    this.router.post(
      "/",
      auth,
      adminRole,
      upload.single("logo"),
      this.brandClientController.createBrandClient,
    );

    // UPDATE BRAND CLIENT
    this.router.patch(
      "/:id",
      auth,
      adminRole,
      upload.single("logo"),
      this.brandClientController.updateBrandClient,
    );

    // DELETE BRAND CLIENT
    this.router.delete(
      "/:id",
      auth,
      adminRole,
      this.brandClientController.deleteBrandClient,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
