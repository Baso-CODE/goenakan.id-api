import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import {
  CreateShipmentNoteCategoryDTO,
  UpdateShipmentNoteCategoryDTO,
} from "./dto/shipment-note.dto";
import { ShipmentNoteCategoryService } from "./notesShipmentCategory.service";

@injectable()
export class ShipmentNoteCategoryController {
  constructor(
    private readonly shipmentNoteCategoryService: ShipmentNoteCategoryService,
  ) {}

  // ==========================================
  // GET ALL
  // ==========================================
  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Service ini sudah include _count (jumlah pemakaian notes)
      const result = await this.shipmentNoteCategoryService.getAllCategories();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // GET ONE BY ID
  // ==========================================
  getOne = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.shipmentNoteCategoryService.getCategoryById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // CREATE
  // ==========================================
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Body sudah divalidasi oleh Middleware sebagai DTO
      const body = req.body as CreateShipmentNoteCategoryDTO;

      const result =
        await this.shipmentNoteCategoryService.createCategory(body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // UPDATE
  // ==========================================
  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateShipmentNoteCategoryDTO;

      const result = await this.shipmentNoteCategoryService.updateCategory(
        id,
        body,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // DELETE
  // ==========================================
  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Service akan melempar error jika kategori sedang dipakai shipment lain
      await this.shipmentNoteCategoryService.deleteCategory(id);

      res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
      next(error);
    }
  };
}
