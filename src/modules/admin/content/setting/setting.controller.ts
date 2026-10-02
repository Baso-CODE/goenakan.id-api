import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";

import { UpdateAppSettingDTO } from "./dto/setting.dto";
import { AppSettingService } from "./setting.service";

@injectable()
export class AppSettingController {
  constructor(private readonly appSettingService: AppSettingService) {}

  getPublicSettings = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.appSettingService.getPublicSettings();

      res.status(200).json({
        data: result || {},
      });
    } catch (error) {
      next(error);
    }
  };

  getAdminSettings = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.appSettingService.getAdminSettings();

      res.status(200).json({
        data: result || {},
      });
    } catch (error) {
      next(error);
    }
  };

  saveSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as UpdateAppSettingDTO;

      const result = await this.appSettingService.saveSettings(body);

      res.status(200).json({
        message: "Application settings berhasil diperbarui",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
