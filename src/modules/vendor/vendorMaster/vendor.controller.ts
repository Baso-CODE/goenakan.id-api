import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateVendorDTO } from "./dto/createVendor.dto";
import { UpdateVendorDTO } from "./dto/updateVendor.dto";
import { VendorExportQuery, VendorService } from "./vendor.service";

@injectable()
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}
  // === CREATE VENDOR ===
  createVendor = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: CreateVendorDTO = req.body;

      const result = await this.vendorService.createVendor(data);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  getVendorsByOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { orderId } = req.params;

      const type = req.query.type as "PRODUCT" | "SERVICE" | undefined;

      const vendors = await this.vendorService.getVendorsByOrder(orderId, type);

      res.status(200).json({ data: vendors });
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL VENDORS FOR ORDER ===
  getAllVendorsForOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const vendors = await this.vendorService.getAllVendorsForOrder();
      res.status(200).json(vendors);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL VENDORS ===
  getAllVendors = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, isActive, startDate, endDate, type } =
        req.query;

      const vendors = await this.vendorService.getAllVendors({
        page: Number(page),
        take: Number(take),
        search: search as string,
        isActive: isActive as string,
        startDate: startDate as string,
        endDate: endDate as string,
        type: type as string,
      });

      res.status(200).json(vendors);
    } catch (error) {
      next(error);
    }
  };

  // === GET VENDOR BY ID ===
  getVendorById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const vendor = await this.vendorService.getVendorById(id);

      res.status(200).send(vendor);
    } catch (error) {
      next(error);
    }
  };

  // === GET VENDOR BY ID ===
  getVendorByIdDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const vendor = await this.vendorService.getVendorByIdDetail(id);

      res.status(200).send(vendor);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE VENDOR ===
  updateVendor = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const data: UpdateVendorDTO = req.body;

      const updatedVendor = await this.vendorService.updateVendor(id, data);

      res.status(200).send(updatedVendor);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE VENDOR ===
  deleteVendor = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.vendorService.deleteVendor(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === TOGGLE ACTIVE / INACTIVE ===
  toggleActive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const vendor = await this.vendorService.toggleActive(id);
      res.status(200).send(vendor);
    } catch (error) {
      next(error);
    }
  };

  exportVendors = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as VendorExportQuery;
      const excelBuffer = await this.vendorService.exportVendorsToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="data-vendor-master-export.xlsx"',
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };
}
