import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateItemNameDTO, UpdateItemNameDTO } from "./dto/item-names.dto";
import { ItemNameExportQuery, ItemNameService } from "./item-names.service";

@injectable()
export class ItemNameController {
  constructor(private readonly itemNameService: ItemNameService) {}

  // === CREATE ITEM NAME ===
  createItemName = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateItemNameDTO;
      const result = await this.itemNameService.createItemName(body);

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL ITEM NAMES (WITH PAGINATION & FILTERS) ===
  getAllItemNames = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, itemCategoryId } = req.query;

      const result = await this.itemNameService.getAllItemNames({
        page: page ? Number(page) : undefined,
        take: take ? Number(take) : undefined,
        search: search as string,
        itemCategoryId: itemCategoryId as string, // Memungkinkan filter berdasarkan kategori induknya
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ITEM NAME BY ID ===
  getItemNameById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.itemNameService.getItemNameById(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE ITEM NAME ===
  updateItemName = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateItemNameDTO;

      const result = await this.itemNameService.updateItemName(id, body);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE ITEM NAME ===
  deleteItemName = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.itemNameService.deleteItemName(id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === EXPORT TO EXCEL ===
  exportItemNames = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as ItemNameExportQuery;

      const excelBuffer = await this.itemNameService.exportToExcel(query);

      // Mengatur Header agar file terunduh otomatis sebagai Excel
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="data-item-names-export.xlsx"',
      );

      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };
}
