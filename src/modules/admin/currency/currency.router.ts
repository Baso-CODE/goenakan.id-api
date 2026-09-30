import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
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
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission("currency"));

    // ==========================================
    // === CURRENCY MANAGEMENT ROUTES ===
    // ==========================================

    // 1. Get All Currencies -> Otomatis butuh 'read'
    this.router.get("/", this.currencyController.getAll);

    // 2. Convert Currency Rate (Statis di atas `/:code`) -> Otomatis butuh 'read' atau 'create'
    this.router.post(
      "/convert/rate",
      validateBody(ConvertCurrencyDTO),
      this.currencyController.convert,
    );

    // 3. Create Currency -> Otomatis butuh 'create'
    this.router.post(
      "/",
      validateBody(CreateCurrencyDTO),
      this.currencyController.create,
    );

    // 4. Get Currency By Code -> Otomatis butuh 'read'
    this.router.get("/:code", this.currencyController.getOne);

    // 5. Update Currency -> Otomatis butuh 'update'
    this.router.patch(
      "/:code",
      validateBody(UpdateCurrencyDTO),
      this.currencyController.update,
    );

    // 6. Delete Currency -> Otomatis butuh 'delete'
    this.router.delete("/:code", this.currencyController.delete);
  };

  getRouter(): Router {
    return this.router;
  }
}
