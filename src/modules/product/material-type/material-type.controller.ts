import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import {
  CreateMaterialTypeDTO,
  UpdateMaterialTypeDTO,
} from "./dto/material-type.dto";
import {
  MaterialTypeExportQuery,
  MaterialTypeService,
} from "./material-type.service";

@injectable()
export class MaterialTypeController {
  constructor(private readonly materialTypeService: MaterialTypeService) {}

  // === CREATE MATERIAL TYPE ===
  createMaterialType = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const body = req.body as CreateMaterialTypeDTO;
      const result = await this.materialTypeService.createMaterialType(body);

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL MATERIAL TYPES (WITH PAGINATION) ===
  getAllMaterialTypes = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search, startDate, endDate } = req.query;

      const result = await this.materialTypeService.getAllMaterialTypes({
        page: page ? Number(page) : undefined,
        take: take ? Number(take) : undefined,
        search: search as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET MATERIAL TYPE BY ID ===
  getMaterialTypeById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.materialTypeService.getMaterialTypeById(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET MATERIAL LIST (FOR DROPDOWNS) ===
  getMaterialList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.materialTypeService.getMaterialTypeList();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE MATERIAL TYPE ===
  updateMaterialType = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateMaterialTypeDTO;

      const result = await this.materialTypeService.updateMaterialType(
        id,
        body,
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE MATERIAL TYPE ===
  deleteMaterialType = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.materialTypeService.deleteMaterialType(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === EXPORT TO EXCEL ===
  exportMaterialTypes = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const query = req.query as unknown as MaterialTypeExportQuery;

      const excelBuffer =
        await this.materialTypeService.exportMaterialTypesToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="data-material-types-export.xlsx"',
      );

      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };
}
