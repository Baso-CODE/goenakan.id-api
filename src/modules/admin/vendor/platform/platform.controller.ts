import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateContactPlatformDTO } from "./dto/createContactPlatform.dto";
import { UpdateContactPlatformDTO } from "./dto/updateContactPlatform.dto";
import {
  ContactPlatformService,
  PlatformExportQuery,
} from "./platform.service";

@injectable()
export class ContactPlatformController {
  constructor(
    private readonly contactPlatformService: ContactPlatformService,
  ) {}

  // === CREATE PLATFORM ===
  createPlatform = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateContactPlatformDTO;
      const result = await this.contactPlatformService.createPlatform(body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL PLATFORMS ===
  getAllPlatforms = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, isActive, startDate, endDate } = req.query;
      const result = await this.contactPlatformService.getAllPlatforms({
        page: page ? Number(page) : undefined,
        take: take ? Number(take) : undefined,
        search: search ? String(search) : undefined,
        isActive: isActive as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ACTIVE PLATFORMS (NO PAGINATION) ===
  getActivePlatforms = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.contactPlatformService.getActivePlatforms();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET PLATFORM BY ID ===
  getPlatformById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.contactPlatformService.getPlatformById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE PLATFORM ===
  updatePlatform = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateContactPlatformDTO;
      const result = await this.contactPlatformService.updatePlatform(id, body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE PLATFORM (SOFT DELETE) ===
  deletePlatform = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.contactPlatformService.deletePlatform(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  exportContactPlatform = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const query = req.query as unknown as PlatformExportQuery;

      const excelBuffer =
        await this.contactPlatformService.exportContactPlatformsToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="data-vendor-items-export.xlsx"',
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };
}
