import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../../middleware/role.middleware";
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
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;
    const adminRole = verifyRole(["SUPER_ADMIN"]);

    // ==========================================
    // 1. PUBLIC ROUTES (Tanpa Autentikasi)
    // ==========================================

    // GET /api/portfolios/public (Untuk Landing Page)
    this.router.get("/public", this.portfolioController.getPublicPortfolios);

    // ==========================================
    // 2. ADMIN ROUTES (Gunakan Auth & Role)
    // ==========================================

    // GET ALL PORTFOLIOS (With Pagination & Search)
    this.router.get(
      "/",
      auth,
      adminRole,
      this.portfolioController.getAllPortfolios,
    );

    // GET BY ID
    this.router.get(
      "/:id",
      auth,
      adminRole,
      this.portfolioController.getPortfolioById,
    );

    // CREATE PORTFOLIO
    this.router.post(
      "/",
      auth,
      adminRole,
      upload.single("image"),
      this.portfolioController.createPortfolio,
    );

    // UPDATE PORTFOLIO
    this.router.patch(
      "/:id",
      auth,
      adminRole,
      upload.single("image"),
      this.portfolioController.updatePortfolio,
    );

    // DELETE PORTFOLIO
    this.router.delete(
      "/:id",
      auth,
      adminRole,
      this.portfolioController.deletePortfolio,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
