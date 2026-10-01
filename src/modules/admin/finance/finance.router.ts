import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import {
  CreateFinanceCategoryDTO,
  UpdateFinanceCategoryDTO,
} from "./dto/categoryFinance.dto";
import {
  CreateFinanceTransactionDTO,
  UpdateFinanceTransactionDTO,
} from "./dto/finance.dto";
import { FinanceController } from "./finance.controller";

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
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission("finance"));

    // ==========================================================
    // 1. ROUTES UNTUK FINANCE CATEGORY (KATEGORI PENGELUARAN)
    // ==========================================================

    // Get All Categories -> Otomatis butuh 'read'
    this.router.get("/categories", this.financeController.getAllCategories);

    // Get Category By ID -> Otomatis butuh 'read'
    this.router.get("/categories/:id", this.financeController.getCategoryById);

    // Create Category -> Otomatis butuh 'create'
    this.router.post(
      "/categories",
      validateBody(CreateFinanceCategoryDTO),
      this.financeController.createCategory,
    );

    // Update Category -> Otomatis butuh 'update'
    this.router.patch(
      "/categories/:id",
      validateBody(UpdateFinanceCategoryDTO),
      this.financeController.updateCategory,
    );

    // Delete Category -> Otomatis butuh 'delete'
    this.router.delete(
      "/categories/:id",
      this.financeController.deleteCategory,
    );

    // ==========================================================
    // 2. ROUTES UNTUK FINANCE TRANSACTION (TRANSAKSI ARUS KAS)
    // ==========================================================

    // Debt Receivables (Statis di atas `/:id`) -> Otomatis butuh 'read'
    this.router.get(
      "/debt-receivables",
      this.financeController.getDebtReceivables,
    );

    // Get All Transactions -> Otomatis butuh 'read'
    this.router.get("/transactions", this.financeController.getAllTransactions);

    // Get Transaction By ID -> Otomatis butuh 'read'
    this.router.get(
      "/transactions/:id",
      this.financeController.getTransactionById,
    );

    // Create Transaction -> Otomatis butuh 'create'
    this.router.post(
      "/transactions",
      validateBody(CreateFinanceTransactionDTO),
      this.financeController.createTransaction,
    );

    // Update Transaction -> Otomatis butuh 'update'
    this.router.patch(
      "/transactions/:id",
      validateBody(UpdateFinanceTransactionDTO),
      this.financeController.updateTransaction,
    );

    // Delete Transaction -> Otomatis butuh 'delete'
    this.router.delete(
      "/transactions/:id",
      this.financeController.deleteTransaction,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
