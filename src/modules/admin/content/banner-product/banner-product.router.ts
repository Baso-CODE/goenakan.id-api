import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { BannerProductController } from "./banner-product.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
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
    // ==========================================
    // 1. PUBLIC ROUTES (Tanpa Autentikasi)
    // ==========================================

    // GET /api/banners/public (Digunakan oleh frontend/client web untuk Carousel)
    this.router.get("/public", this.bannerController.getPublicBanners);

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    //  Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission("banner_product"));

    // ==========================================
    // 2. ADMIN ROUTES (Otomatis menggunakan Auth & Role)
    // ==========================================

    // GET ALL BANNERS (Table Admin dengan Pagination & Filter)
    this.router.get("/", this.bannerController.getAllBanners);

    // GET BY ID (Mendapatkan satu data banner spesifik)
    this.router.get("/:id", this.bannerController.getBannerById);

    // CREATE BANNER (Menambah banner baru beserta upload gambar)
    this.router.post(
      "/",
      upload.single("image"),
      this.bannerController.createBanner,
    );

    // UPDATE BANNER (Memperbarui data atau mengganti gambar banner)
    this.router.patch(
      "/:id",
      upload.single("image"),
      this.bannerController.updateBanner,
    );

    // DELETE BANNER (Menghapus banner dan gambarnya dari sistem)
    this.router.delete("/:id", this.bannerController.deleteBanner);
  };

  // Fungsi untuk mengekspor router agar bisa didaftarkan di aplikasi utama (app.ts)
  getRouter(): Router {
    return this.router;
  }
}
