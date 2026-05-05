import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";

import {
  CreateItemCategoryDTO,
  UpdateItemCategoryDTO,
} from "./dto/item-category.dto";
import {
  ItemCategoryExportQuery,
  ItemCategoryService,
} from "./item-category.service";

@injectable()
export class ItemCategoryController {
  constructor(private readonly itemCategoryService: ItemCategoryService) {}

  // === CREATE ITEM CATEGORY ===
  createItemCategory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const body = req.body as CreateItemCategoryDTO;
      const result = await this.itemCategoryService.createItemCategory(body);

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL ITEM CATEGORIES (WITH PAGINATION & FILTERS) ===
  getAllItemCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search, productCategoryId } = req.query;

      const result = await this.itemCategoryService.getAllItemCategories({
        page: page ? Number(page) : undefined,
        take: take ? Number(take) : undefined,
        search: search as string,
        productCategoryId: productCategoryId as string, // Filter berdasarkan kategori produk induk
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ITEM CATEGORY BY ID ===
  getItemCategoryById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.itemCategoryService.getItemCategoryById(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE ITEM CATEGORY ===
  updateItemCategory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateItemCategoryDTO;

      const result = await this.itemCategoryService.updateItemCategory(
        id,
        body,
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE ITEM CATEGORY ===
  deleteItemCategory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.itemCategoryService.deleteItemCategory(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === EXPORT TO EXCEL ===
  exportItemCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const query = req.query as unknown as ItemCategoryExportQuery;

      const excelBuffer = await this.itemCategoryService.exportToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="data-item-categories-export.xlsx"',
      );

      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };
}
