import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CreateVendorPriceRecordDTO, UpdateVendorPriceRecordDTO } from "./supplier-cogs.dto";
import { SupplierCogsController } from "./supplier-cogs.controller";

@autoInjectable()
export class SupplierCogsRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly controller: SupplierCogsController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // === EXCHANGE RATE PROXY ===
    this.router.get(
      "/rates",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.controller.getExchangeRates,
    );

    // === CRUD ENDPOINTS ===
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.controller.getAllRecords,
    );

    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.controller.getRecordById,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateVendorPriceRecordDTO),
      this.controller.createRecord,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateVendorPriceRecordDTO),
      this.controller.updateRecord,
    );

    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.controller.deleteRecord,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
