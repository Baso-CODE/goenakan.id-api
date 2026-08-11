import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { SupplierCogsService } from "./supplier-cogs.service";
import { CreateVendorPriceRecordDTO, UpdateVendorPriceRecordDTO } from "./supplier-cogs.dto";

@injectable()
export class SupplierCogsController {
  constructor(private readonly service: SupplierCogsService) {}

  getAllRecords = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId, vendorId } = req.query;
      const result = await this.service.getAllRecords({
        productId: productId as string,
        vendorId: vendorId as string,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getRecordById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.service.getRecordById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  createRecord = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateVendorPriceRecordDTO;
      const result = await this.service.createRecord(body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateRecord = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateVendorPriceRecordDTO;
      const result = await this.service.updateRecord(id, body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteRecord = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.service.deleteRecord(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getExchangeRates = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { base } = req.query;
      const result = await this.service.getLatestRates((base as string) || "CNY");
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
