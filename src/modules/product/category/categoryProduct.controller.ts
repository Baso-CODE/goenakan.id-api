import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import {
  CategoryProductsExportQuery,
  ProductCategoryService,
} from "./categoryProduct.service";
import { CreateProductCategoryDTO } from "./dto/createCategoryProduct.dto";
import { UpdateProductCategoryDTO } from "./dto/updateCategoryProduct.dto";

@injectable()
export class ProductCategoryController {
  constructor(
    private readonly productCategoryService: ProductCategoryService,
  ) {}

  // === CREATE CATEGORY ===
  createCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateProductCategoryDTO;
      const result = await this.productCategoryService.createCategory(body);
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
      const { page, take, type, search } = req.query;

      const result = await this.productCategoryService.getAllCategories({
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
      const result = await this.productCategoryService.getCategoryById(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET CATEGORY LIST ===
  getCategoryList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.productCategoryService.getAllCategoriesList();
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE CATEGORY ===
  updateCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateProductCategoryDTO;
      const result = await this.productCategoryService.updateCategory(id, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE CATEGORY (SOFT DELETE) ===
  deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.productCategoryService.deleteCategory(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  exportCategoryProduct = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // Casting req.query ke interface yang sesuai
      const query = req.query as unknown as CategoryProductsExportQuery;

      const excelBuffer =
        await this.productCategoryService.exportCategoryProductsToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="data-kategori-vendor-export.xlsx"',
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };
}
