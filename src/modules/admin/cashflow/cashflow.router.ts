import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
//  Hapus verifyRole dan ganti dengan autoVerifyPermission
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CashflowController } from "./cashflow.controller";
import { SaveCashflowDTO } from "./dto/cashflow.dto";

@autoInjectable()
export class CashflowRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly cashflowController: CashflowController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Semua rute di bawahnya akan otomatis terlindungi.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    //  Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission("cashflow"));

    // ==========================================
    // === PROTECTED ADMIN ROUTES ===
    // ==========================================

    this.router.get("/", this.cashflowController.getAll);

    this.router.get("/detail", this.cashflowController.getDetailByOrder);

    this.router.get("/:id/vendors", this.cashflowController.getVendorsForOrder);

    this.router.post(
      "/",
      validateBody(SaveCashflowDTO),
      this.cashflowController.save,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
