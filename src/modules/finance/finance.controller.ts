import { TransactionType } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";

// Import DTOs (Hanya untuk type hinting di Controller)
import {
  CreateFinanceCategoryDTO,
  UpdateFinanceCategoryDTO,
} from "./dto/categoryFinance.dto";
import {
  CreateFinanceTransactionDTO,
  UpdateFinanceTransactionDTO,
} from "./dto/finance.dto";
import { FinanceTransactionService } from "./finance.service";
import { FinanceCategoryService } from "./financeCategory.service";

@injectable()
export class FinanceController {
  constructor(
    private readonly categoryService: FinanceCategoryService,
    private readonly transactionService: FinanceTransactionService,
  ) {}

  // ===============================================
  // 1. FINANCE CATEGORY CONTROLLERS
  // ===============================================

  getAllCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { type, isActive } = req.query;

      // Parsing boolean dari string query param
      let parsedIsActive: boolean | undefined = undefined;
      if (isActive === "true") parsedIsActive = true;
      if (isActive === "false") parsedIsActive = false;

      const result = await this.categoryService.getAllCategories({
        type: type as TransactionType,
        isActive: parsedIsActive,
      });

      res.status(200).json({
        message: "Berhasil mengambil data kategori keuangan",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getCategoryById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.categoryService.getCategoryById(id);

      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  createCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateFinanceCategoryDTO;
      const result = await this.categoryService.createCategory(body);

      res.status(201).json({
        message: "Kategori keuangan berhasil dibuat",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  updateCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateFinanceCategoryDTO;
      const result = await this.categoryService.updateCategory(id, body);

      res.status(200).json({
        message: "Kategori keuangan berhasil diupdate",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      await this.categoryService.deleteCategory(id);

      res.status(200).json({
        message: "Kategori keuangan berhasil dihapus",
      });
    } catch (error) {
      next(error);
    }
  };

  // ===============================================
  // 2. FINANCE TRANSACTION CONTROLLERS
  // ===============================================

  getAllTransactions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, startDate, endDate, type, categoryId, search } =
        req.query;

      const result = await this.transactionService.getAllTransactions({
        page: page ? Number(page) : undefined,
        take: take ? Number(take) : undefined,
        startDate: startDate as string,
        endDate: endDate as string,
        type: type as TransactionType,
        categoryId: categoryId as string,
        search: search as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getTransactionById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.transactionService.getTransactionById(id);

      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  createTransaction = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const body = req.body as CreateFinanceTransactionDTO;

      // Mengambil ID User dari Token / Session yang di-inject oleh NextAuthMiddleware
      // Sesuaikan `req.user.id` ini dengan struktur payload Auth di project Anda.
      // Jika di project Anda object-nya bernama lain, ubah (req as any).user.id
      const userId = (req as any).user?.id || (req as any).user?.sub;

      if (!userId) {
        return res
          .status(401)
          .json({ message: "Unauthorized: User ID tidak ditemukan di sesi" });
      }

      const result = await this.transactionService.createTransaction(
        body,
        userId,
      );

      res.status(201).json({
        message: "Transaksi keuangan berhasil dicatat",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  updateTransaction = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateFinanceTransactionDTO;
      const result = await this.transactionService.updateTransaction(id, body);

      res.status(200).json({
        message: "Transaksi keuangan berhasil diupdate",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteTransaction = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      await this.transactionService.deleteTransaction(id);

      res.status(200).json({
        message: "Transaksi keuangan berhasil dihapus",
      });
    } catch (error) {
      next(error);
    }
  };
}
