import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";

// Import Controller
import { FinanceController } from "./finance.controller";

// Import DTOs
import {
  CreateFinanceCategoryDTO,
  UpdateFinanceCategoryDTO,
} from "./dto/categoryFinance.dto";
import {
  CreateFinanceTransactionDTO,
  UpdateFinanceTransactionDTO,
} from "./dto/finance.dto";

@autoInjectable()
export class FinanceRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly financeController: FinanceController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================================
    // 1. ROUTES UNTUK FINANCE CATEGORY (KATEGORI PENGELUARAN)
    // ==========================================================

    this.router.get(
      "/categories",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.financeController.getAllCategories,
    );

    this.router.get(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.financeController.getCategoryById,
    );

    this.router.post(
      "/categories",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateFinanceCategoryDTO),
      this.financeController.createCategory,
    );

    this.router.patch(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateFinanceCategoryDTO),
      this.financeController.updateCategory,
    );

    this.router.delete(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.financeController.deleteCategory,
    );

    // ==========================================================
    // 2. ROUTES UNTUK FINANCE TRANSACTION (TRANSAKSI ARUS KAS)
    // ==========================================================

    this.router.get(
      "/transactions",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.financeController.getAllTransactions,
    );

    this.router.get(
      "/transactions/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.financeController.getTransactionById,
    );

    this.router.post(
      "/transactions",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateFinanceTransactionDTO),
      this.financeController.createTransaction,
    );

    this.router.patch(
      "/transactions/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateFinanceTransactionDTO),
      this.financeController.updateTransaction,
    );

    this.router.delete(
      "/transactions/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.financeController.deleteTransaction,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
