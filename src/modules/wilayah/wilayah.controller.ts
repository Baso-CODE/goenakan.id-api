import { NextFunction, Request, Response } from "express";
import { autoInjectable } from "tsyringe";
import { WilayahService } from "./wilayah.service";

@autoInjectable()
export class WilayahController {
  constructor(private readonly wilayahService: WilayahService) {}

  // === GET PROVINCES ===
  getProvinces = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.wilayahService.getProvinces();
      res.status(200).json({
        status: "success",
        message: "List of provinces",
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  // === GET REGENCIES ===
  getRegencies = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { provinceCode } = req.params;
      const data = await this.wilayahService.getRegencies(provinceCode);
      res.status(200).json({
        status: "success",
        message: "List of regencies",
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  // === GET DISTRICTS ===
  getDistricts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { regencyCode } = req.params;
      const data = await this.wilayahService.getDistricts(regencyCode);
      res.status(200).json({
        status: "success",
        message: "List of districts",
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  // === GET VILLAGES ===
  getVillages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { districtCode } = req.params;
      const data = await this.wilayahService.getVillages(districtCode);
      res.status(200).json({
        status: "success",
        message: "List of villages",
        data,
      });
    } catch (error) {
      next(error);
    }
  };
}
