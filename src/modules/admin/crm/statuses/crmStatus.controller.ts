import { NextFunction, Request, Response } from "express";
import { autoInjectable } from "tsyringe";
import { CrmStatusService } from "./crmStatus.service";

@autoInjectable()
export class CrmStatusController {
  constructor(private readonly crmStatusService: CrmStatusService) {}

  getStatuses = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const statuses = await this.crmStatusService.getStatuses();
      res.status(200).json({
        success: true,
        message: "Berhasil mengambil daftar status prospek",
        data: statuses,
      });
    } catch (error) {
      next(error);
    }
  };

  createStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await this.crmStatusService.createStatus(req.body);
      res.status(201).json({
        success: true,
        message: "Status prospek berhasil ditambahkan",
        data: status,
      });
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await this.crmStatusService.updateStatus(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: "Status prospek berhasil diperbarui",
        data: status,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.crmStatusService.deleteStatus(req.params.id);
      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  reorderStatuses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const statuses = await this.crmStatusService.reorderStatuses(req.body.statusIds);
      res.status(200).json({
        success: true,
        message: "Urutan tahapan status berhasil diperbarui",
        data: statuses,
      });
    } catch (error) {
      next(error);
    }
  };
}
