import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { SalesController } from "./sales.controller";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { CreateSalesDTO } from "./dto/createSales.dto";
import { UpdateSalesDTO } from "./dto/updateSales.dto";

import multer from "multer";
import { parseFormData } from "../../middleware/parseFormData.middleware";

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
    // === PUBLIC ROUTE: Get All Active Items ===
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.salesController.getAllSales,
    );

    // Get All
    this.router.get(
      "/order",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.salesController.getAllSalesForOrder,
    );

    // === PROTECTED ROUTES ===
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.salesController.getSalesById,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      upload.single("signature"),
      parseFormData,
      validateBody(CreateSalesDTO),
      this.salesController.createSales,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      upload.single("signature"),
      parseFormData,
      validateBody(UpdateSalesDTO),
      this.salesController.updateSales,
    );

    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.salesController.deleteSales,
    );
    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.salesController.toggleActive,
    );

    this.router.patch(
      "/:id/banks",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.salesController.updateSalesBankAccount,
    );

    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.salesController.exportSales,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
