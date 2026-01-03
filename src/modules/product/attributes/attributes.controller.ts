import { Request, Response, NextFunction } from "express";
import { injectable } from "tsyringe";

import { CreateAttributeDTO } from "./dto/createAttributes.dto";
import { UpdateAttributeDTO } from "./dto/updateAttributes.dto";
import { AttributeExportQuery, AttributeService } from "./attributes.service";

@injectable()
export class AttributeController {
  constructor(private readonly attributeService: AttributeService) {}

  // === CREATE ATTRIBUTE (WITH VALUES) ===
  createAttribute = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateAttributeDTO;
      const result = await this.attributeService.createAttribute(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL ATTRIBUTES (PAGINATION + SEARCH) ===
  getAllAttributes = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search } = req.query;

      const result = await this.attributeService.getAllAttributes({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ATTRIBUTE BY ID ===
  getAttributeById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.attributeService.getAttributeById(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ATTRIBUTE LIST (FOR DROPDOWN) ===
  getAttributeList = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.attributeService.getAllAttributesList();
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE ATTRIBUTE (NAME + VALUES) ===
  updateAttribute = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateAttributeDTO;

      const result = await this.attributeService.updateAttribute(id, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE ATTRIBUTE ===
  deleteAttribute = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.attributeService.deleteAttribute(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  exportAttributes = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const query = req.query as unknown as AttributeExportQuery;
      const excelBuffer =
        await this.attributeService.exportAttributesToExcel(query);

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
