import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateVendorCategoryDTO } from "./dto/createCategoryVendor.dto";
import { UpdateVendorCategoryDTO } from "./dto/updateCategoryVendor.dto";
import {
  CategoryExportQuery,
  VendorCategoryService,
} from "./categoryVendor.service";

@injectable()
export class VendorCategoryController {
  constructor(private readonly vendorCategoryService: VendorCategoryService) {}

  // === CREATE CATEGORY ===
  createCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateVendorCategoryDTO;
      const result = await this.vendorCategoryService.createCategory(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // Get All Active Categories
  getActiveCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const categories = await this.vendorCategoryService.getActiveCategories();
      res.status(200).json(categories);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL ACTIVE CATEGORIES ===
  getAllCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, type, search } = req.query;

      const result = await this.vendorCategoryService.getAllCategories({
        page: Number(page),
        take: Number(take),
        type: type as string,
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
      const result = await this.vendorCategoryService.getCategoryById(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE CATEGORY ===
  updateCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateVendorCategoryDTO;
      const result = await this.vendorCategoryService.updateCategory(id, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE CATEGORY (SOFT DELETE) ===
  deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.vendorCategoryService.deleteCategory(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  exportCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // Casting req.query ke interface yang sesuai
      const query = req.query as unknown as CategoryExportQuery;

      const excelBuffer =
        await this.vendorCategoryService.exportVendorCategoriesToExcel(query);

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
