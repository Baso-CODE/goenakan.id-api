import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../../middleware/role.middleware";
import { BannerProductController } from "./banner-product.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit 5MB
});

@autoInjectable()
export class BannerProductRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly bannerController: BannerProductController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Menyiapkan middleware keamanan
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;
    const adminRole = verifyRole(["SUPER_ADMIN"]);

    // ==========================================
    // 1. PUBLIC ROUTES (Tanpa Autentikasi)
    // ==========================================

    // GET /api/banners/public (Digunakan oleh frontend/client web untuk Carousel)
    this.router.get("/public", this.bannerController.getPublicBanners);

    // ==========================================
    // 2. ADMIN ROUTES (Gunakan Auth & Role)
    // ==========================================

    // GET ALL BANNERS (Table Admin dengan Pagination & Filter)
    this.router.get("/", auth, adminRole, this.bannerController.getAllBanners);

    // GET BY ID (Mendapatkan satu data banner spesifik)
    this.router.get(
      "/:id",
      auth,
      adminRole,
      this.bannerController.getBannerById,
    );

    // CREATE BANNER (Menambah banner baru beserta upload gambar)
    // Perhatikan: "image" adalah nama field yang harus dikirim dari frontend (FormData)
    this.router.post(
      "/",
      auth,
      adminRole,
      upload.single("image"),
      this.bannerController.createBanner,
    );

    // UPDATE BANNER (Memperbarui data atau mengganti gambar banner)
    this.router.patch(
      "/:id",
      auth,
      adminRole,
      upload.single("image"),
      this.bannerController.updateBanner,
    );

    // DELETE BANNER (Menghapus banner dan gambarnya dari sistem)
    this.router.delete(
      "/:id",
      auth,
      adminRole,
      this.bannerController.deleteBanner,
    );
  };

  // Fungsi untuk mengekspor router agar bisa didaftarkan di aplikasi utama (app.ts)
  getRouter(): Router {
    return this.router;
  }
}
