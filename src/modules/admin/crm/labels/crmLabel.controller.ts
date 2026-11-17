import { NextFunction, Request, Response } from "express";
import { autoInjectable } from "tsyringe";
import { CrmLabelService } from "./crmLabel.service";

@autoInjectable()
export class CrmLabelController {
  constructor(private readonly crmLabelService: CrmLabelService) {}

  getLabels = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const labels = await this.crmLabelService.getLabels();
      res.status(200).json({
        success: true,
        message: "Berhasil mengambil daftar label prospek",
        data: labels,
      });
    } catch (error) {
      next(error);
    }
  };

  createLabel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const label = await this.crmLabelService.createLabel(req.body);
      res.status(201).json({
        success: true,
        message: "Label prospek berhasil ditambahkan",
        data: label,
      });
    } catch (error) {
      next(error);
    }
  };

  updateLabel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const label = await this.crmLabelService.updateLabel(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: "Label prospek berhasil diperbarui",
        data: label,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteLabel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.crmLabelService.deleteLabel(req.params.id);
      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
