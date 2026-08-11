import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { SalesController } from "./sales.controller";

import { CreateSalesDTO } from "./dto/createSales.dto";
import { UpdateSalesDTO } from "./dto/updateSales.dto";

import multer from "multer";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
// ✨ Import autoVerifyPermission dan hapus verifyRole
import { parseFormData } from "../../../middleware/parseFormData.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";

const upload = multer({ storage: multer.memoryStorage() });

@autoInjectable()
export class SalesRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly salesController: SalesController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Melindungi semua route di bawahnya dengan token dan permission dinamis.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // ==========================================
    // SALES ROUTES
    // ==========================================

    // === GET ALL SALES ===
    this.router.get("/", this.salesController.getAllSales);

    // === GET ALL FOR ORDER ===
    this.router.get("/order", this.salesController.getAllSalesForOrder);

    // === EXPORT EXCEL ===
    this.router.get("/export/excel", this.salesController.exportSales);

    // === GET BY ID ===
    this.router.get("/:id", this.salesController.getSalesById);

    // === CREATE SALES ===
    this.router.post(
      "/",
      upload.single("signature"),
      parseFormData,
      validateBody(CreateSalesDTO),
      this.salesController.createSales,
    );

    // === UPDATE SALES ===
    this.router.patch(
      "/:id",
      upload.single("signature"),
      parseFormData,
      validateBody(UpdateSalesDTO),
      this.salesController.updateSales,
    );

    // === TOGGLE ACTIVE ===
    this.router.patch("/:id/toggle", this.salesController.toggleActive);

    // === UPDATE BANK ACCOUNT ===
    this.router.patch(
      "/:id/banks",
      this.salesController.updateSalesBankAccount,
    );

    // === DELETE SALES ===
    this.router.delete("/:id", this.salesController.deleteSales);
  };

  getRouter(): Router {
    return this.router;
  }
}
