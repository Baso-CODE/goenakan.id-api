import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import {
  CreateQuotationNoteCategoryDTO,
  UpdateQuotationNoteCategoryDTO,
} from "./dto/quotationNoteCategory.dto";
import { QuotationNoteCategoryService } from "./quotationNoteCategory.service";

@injectable()
export class QuotationNoteCategoryController {
  constructor(
    private readonly quotationNoteCategoryService: QuotationNoteCategoryService,
  ) {}

  // ==========================================
  // GET ALL
  // ==========================================
  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.quotationNoteCategoryService.getAllCategories();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // GET ONE BY ID
  // ==========================================
  getOne = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result =
        await this.quotationNoteCategoryService.getCategoryById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // CREATE
  // ==========================================
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateQuotationNoteCategoryDTO;
      const result =
        await this.quotationNoteCategoryService.createCategory(body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // UPDATE
  // ==========================================
  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateQuotationNoteCategoryDTO;
      const result = await this.quotationNoteCategoryService.updateCategory(
        id,
        body,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // DELETE
  // ==========================================
  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      await this.quotationNoteCategoryService.deleteCategory(id);
      res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
      next(error);
    }
  };
}
