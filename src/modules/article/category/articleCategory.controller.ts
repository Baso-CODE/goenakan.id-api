import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import {
  CreateArticleCategoryDTO,
  UpdateArticleCategoryDTO,
} from "../dto/articleCategory.dto";
import {
  ArticleCategoryExportQuery,
  ArticleCategoryService,
} from "./articleCategory.service";

@injectable()
export class ArticleCategoryController {
  constructor(
    private readonly articleCategoryService: ArticleCategoryService,
  ) {}

  // === CREATE CATEGORY ===
  createCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateArticleCategoryDTO;
      const result = await this.articleCategoryService.createCategory(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL CATEGORIES ===
  getAllCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search } = req.query;

      const result = await this.articleCategoryService.getAllCategories({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET CATEGORY BY ID ===
  getCategoryById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.articleCategoryService.getCategoryById(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET CATEGORY LIST (Untuk Dropdown) ===
  getCategoryList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.articleCategoryService.getAllCategoriesList();
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE CATEGORY ===
  updateCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateArticleCategoryDTO;
      const result = await this.articleCategoryService.updateCategory(id, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE CATEGORY ===
  deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.articleCategoryService.deleteCategory(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === EXPORT TO EXCEL ===
  exportCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Casting req.query ke interface yang sesuai
      const query = req.query as unknown as ArticleCategoryExportQuery;

      const excelBuffer =
        await this.articleCategoryService.exportCategoryProductsToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="data-kategori-artikel-export.xlsx"',
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };
}
