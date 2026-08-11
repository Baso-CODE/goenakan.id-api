import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
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
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.cashflowController.getAll,
    );
    this.router.get(
      "/detail",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.cashflowController.getDetailByOrder,
    );

    this.router.get(
      "/:id/vendors",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_INVOICE"]),
      this.cashflowController.getVendorsForOrder,
    );
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(SaveCashflowDTO),
      this.cashflowController.save,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
