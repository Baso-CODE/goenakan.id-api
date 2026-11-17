import { NextFunction, Request, Response } from "express";
import { injectable, singleton } from "tsyringe";
import { CrmSettingService } from "./crmSetting.service";

@singleton()
@injectable()
export class CrmSettingController {
  constructor(private readonly crmSettingService: CrmSettingService) {}

  getSettings = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await this.crmSettingService.getSettings();
      res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.crmSettingService.updateSettings(req.body);
      res.status(200).json({
        success: true,
        message: "Pengaturan CRM berhasil disimpan",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  getSessions = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessions = await this.crmSettingService.getAvailableSessions();
      res.status(200).json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      next(error);
    }
  };
}
