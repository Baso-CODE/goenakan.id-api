import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { UpdateAppSettingDTO } from "./dto/setting.dto";
import { AppSettingService } from "./setting.service";

@injectable()
export class AppSettingController {
  constructor(private readonly appSettingService: AppSettingService) {}

  // === GET SETTINGS ===
  getSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.appSettingService.getSettings();

      // Jika belum ada data, kita kembalikan object kosong atau null (status 200)
      // agar frontend tidak error
      res.status(200).json(result || {});
    } catch (error) {
      next(error);
    }
  };

  // === SAVE SETTINGS (UPSERT) ===
  saveSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // req.body sudah divalidasi oleh middleware sebagai UpdateAppSettingDTO
      const body = req.body as UpdateAppSettingDTO;

      const result = await this.appSettingService.saveSettings(body);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
