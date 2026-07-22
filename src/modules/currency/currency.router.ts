import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { CurrencyController } from "./currency.controller";
import {
  ConvertCurrencyDTO,
  CreateCurrencyDTO,
  UpdateCurrencyDTO,
} from "./dto/currency.dto";

@autoInjectable()
export class CurrencyRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly currencyController: CurrencyController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // PUBLIC / READ-ONLY ROUTES
    // ==========================================

    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.currencyController.getAll,
    );

    this.router.get(
      "/:code",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.currencyController.getOne,
    );

    this.router.post(
      "/convert/rate",
      this.nextAuthMiddleware.verifyNextAuthToken,
      validateBody(ConvertCurrencyDTO),
      this.currencyController.convert,
    );

    // ==========================================
    // PROTECTED / ADMIN ROUTES
    // ==========================================

    // Create
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN"]),
      validateBody(CreateCurrencyDTO),
      this.currencyController.create,
    );

    // Update
    this.router.patch(
      "/:code",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN"]),
      validateBody(UpdateCurrencyDTO),
      this.currencyController.update,
    );

    // Delete
    this.router.delete(
      "/:code",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN"]),
      this.currencyController.delete,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
