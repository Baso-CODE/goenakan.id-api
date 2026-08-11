import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { PortfolioController } from "./portfolio.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

@autoInjectable()
export class PortfolioRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly portfolioController: PortfolioController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // 1. PUBLIC ROUTES (Tanpa Autentikasi)
    // ==========================================

    // GET /api/portfolios/public (Untuk Landing Page)
    this.router.get("/public", this.portfolioController.getPublicPortfolios);

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

    // GET ALL PORTFOLIOS (With Pagination & Search)
    this.router.get("/", this.portfolioController.getAllPortfolios);

    // GET BY ID
    this.router.get("/:id", this.portfolioController.getPortfolioById);

    // CREATE PORTFOLIO
    this.router.post(
      "/",
      upload.single("image"),
      this.portfolioController.createPortfolio,
    );

    // UPDATE PORTFOLIO
    this.router.patch(
      "/:id",
      upload.single("image"),
      this.portfolioController.updatePortfolio,
    );

    // DELETE PORTFOLIO
    this.router.delete("/:id", this.portfolioController.deletePortfolio);
  };

  getRouter(): Router {
    return this.router;
  }
}
