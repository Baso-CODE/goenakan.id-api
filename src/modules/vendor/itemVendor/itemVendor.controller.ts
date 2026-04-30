import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateVendorItemDTO } from "./dto/createItemVendor.dto";
import { UpdateVendorItemDTO } from "./dto/updateItemVendor.dto";
import { ItemVendorExportQuery, VendorItemService } from "./itemVendor.service";

@injectable()
export class ItemVendorController {
  constructor(private readonly vendorItemService: VendorItemService) {}

  // ✅ Create Item
  createItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto: CreateVendorItemDTO = req.body;
      const newItem = await this.vendorItemService.createItem(dto);
      res.status(201).send(newItem);
    } catch (error) {
      next(error);
    }
  };

  // ✅ Get All Items
  getAllItems = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, isActive, search, categoryId, startDate, endDate } =
        req.query;

      const items = await this.vendorItemService.getAllItems({
        page: Number(page),
        take: Number(take),
        isActive: isActive as string,
        search: search as string,
        categoryId: categoryId as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.status(200).json(items);
    } catch (error) {
      next(error);
    }
  };
  getActiveItems = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await this.vendorItemService.getActiveItems();
      res.status(200).send(items);
    } catch (error) {
      next(error);
    }
  };

  // ✅ Get Item by ID
  getItemById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const item = await this.vendorItemService.getItemById(id);
      res.status(200).send(item);
    } catch (error) {
      next(error);
    }
  };

  // ✅ Update Item
  updateItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const dto: UpdateVendorItemDTO = req.body;
      const updatedItem = await this.vendorItemService.updateItem(id, dto);
      res.status(200).send(updatedItem);
    } catch (error) {
      next(error);
    }
  };

  // ✅ Soft Delete Item
  deleteItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const deletedItem = await this.vendorItemService.deleteItem(id);
      res.status(200).send(deletedItem);
    } catch (error) {
      next(error);
    }
  };

  exportItems = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as ItemVendorExportQuery;

      const excelBuffer =
        await this.vendorItemService.exportVendorItemsToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="data-vendor-items-export.xlsx"',
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };
}
