import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateNoteCategoryDTO } from "../dto/createCategory.dto";
import { UpdateNoteCategoryDTO } from "../dto/updateCategory.dto";
import {
  NoteCategoryExportQuery,
  NoteCategoryService,
} from "./categoryNotes.service";

@injectable()
export class NoteCategoryController {
  constructor(private readonly noteCategoryService: NoteCategoryService) {}

  // === CREATE DEPARTMENT ===
  createDepartment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const body = req.body as CreateNoteCategoryDTO;
      const result = await this.noteCategoryService.createNoteCategory(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL WITH PAGINATION ===
  getAllDepartments = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search } = req.query;

      const result = await this.noteCategoryService.getAllNoteCategories({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET DEPARTMENT BY ID ===
  getDepartmentBySlug = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { slug } = req.params;
      const result = await this.noteCategoryService.getNoteCategoryBySlug(slug);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET LIST (FOR DROPDOWN) ===
  getDepartmentList = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.noteCategoryService.getAllNoteCategoriesList();
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE DEPARTMENT ===
  updateDepartment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { slug } = req.params;
      const body = req.body as UpdateNoteCategoryDTO;
      const result = await this.noteCategoryService.updateNoteCategory(
        slug,
        body,
      );
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE DEPARTMENT ===
  deleteDepartment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.noteCategoryService.deleteNoteCategory(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  exportDepartment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // Casting req.query ke interface yang sesuai
      const query = req.query as unknown as NoteCategoryExportQuery;

      const excelBuffer =
        await this.noteCategoryService.exportNoteCategoryToExcel(query);

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
