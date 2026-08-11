import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { BestPriceGuaranteeService } from "./bestPriceGuarantee.service";
import { BestPriceCategoryService } from "./bestPriceGuaranteeCategory.service";
import {
  CreateBestPriceGuaranteeDTO,
  UpdateBestPriceGuaranteeDTO,
} from "./dto/bestPriceGuarantee.dto";
import {
  CreateBestPriceCategoryDTO,
  UpdateBestPriceCategoryDTO,
} from "./dto/bestPriceGuaranteeCategory.dto";

@injectable()
export class BestPriceGuaranteeController {
  constructor(
    private readonly categoryService: BestPriceCategoryService,
    private readonly guaranteeService: BestPriceGuaranteeService,
  ) {}

  // =================================================================
  // SECTION 1: CATEGORIES
  // =================================================================

  createCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.categoryService.createCategory(
        req.body as CreateBestPriceCategoryDTO,
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  getAllCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search } = req.query;
      const result = await this.categoryService.getAllCategories({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getAllCategoriesList = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.categoryService.getAllCategoriesList();
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  getCategoryById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const result = await this.categoryService.getCategoryById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const result = await this.categoryService.updateCategory(
        id,
        req.body as UpdateBestPriceCategoryDTO,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.categoryService.deleteCategory(id);
      res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
      next(error);
    }
  };

  exportCategoryToExcel = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { startDate, endDate, isActive } = req.query;
      const excelBuffer = await this.categoryService.exportCategoryToExcel({
        startDate: startDate as string,
        endDate: endDate as string,
        isActive: isActive as "true" | "false" | undefined,
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="best-price-categories-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      );
      res.status(200).send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };

  // =================================================================
  // SECTION 2: ITEMS (GUARANTEES)
  // =================================================================

  createGuarantee = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.guaranteeService.createGuarantee(
        req.body as CreateBestPriceGuaranteeDTO,
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  getAllGuarantees = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search, categoryId } = req.query;
      const result = await this.guaranteeService.getAllGuarantees({
        page: Number(page),
        take: Number(take),
        search: search as string,
        categoryId: categoryId ? Number(categoryId) : undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getGuaranteeById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const id = Number(req.params.id);
      const result = await this.guaranteeService.getGuaranteeById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateGuarantee = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const result = await this.guaranteeService.updateGuarantee(
        id,
        req.body as UpdateBestPriceGuaranteeDTO,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteGuarantee = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.guaranteeService.deleteGuarantee(id);
      res.status(200).json({ message: "Guarantee item deleted successfully" });
    } catch (error) {
      next(error);
    }
  };

  exportGuaranteeToExcel = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { startDate, endDate, isActive, categoryId } = req.query;
      const excelBuffer = await this.guaranteeService.exportGuaranteeToExcel({
        startDate: startDate as string,
        endDate: endDate as string,
        isActive: isActive as "true" | "false" | undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="best-price-guarantees-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      );
      res.status(200).send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };

  // =================================================================
  // SECTION 3: PUBLIC ENDPOINTS (FRONTEND / LANDING PAGE)
  // =================================================================

  getMainPageGuarantees = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { categoryId } = req.query;
      const result = await this.guaranteeService.getMainPageGuarantees({
        categoryId: categoryId ? Number(categoryId) : undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
