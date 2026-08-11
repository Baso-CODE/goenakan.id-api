import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { DepartmentExportQuery, DepartmentService } from "./department.service";
import { CreateDepartmentDTO } from "./dto/createDepartment.dto";
import { UpdateDepartmentDTO } from "./dto/updateDepartment.dto";

@injectable()
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  // === CREATE DEPARTMENT ===
  createDepartment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const body = req.body as CreateDepartmentDTO;
      const result = await this.departmentService.createDepartment(body);
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

      const result = await this.departmentService.getAllDepartments({
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
      const result = await this.departmentService.getDepartmentBySlug(slug);
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
      const result = await this.departmentService.getAllDepartmentsList();
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
      const body = req.body as UpdateDepartmentDTO;
      const result = await this.departmentService.updateDepartment(slug, body);
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
      const result = await this.departmentService.deleteDepartment(id);
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
      const query = req.query as unknown as DepartmentExportQuery;

      const excelBuffer =
        await this.departmentService.exportDepartmentToExcel(query);

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
