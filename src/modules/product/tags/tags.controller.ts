import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateTagDTO, UpdateTagDTO } from "./dto/tags.dto";
import { ProductTagService, TagExportQuery } from "./tags.service";

@injectable()
export class ProductTagController {
  constructor(private readonly productTagService: ProductTagService) {}

  // === CREATE TAG ===
  createTag = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateTagDTO;
      const result = await this.productTagService.createTag(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL TAGS ===
  getAllTags = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search } = req.query;

      const result = await this.productTagService.getAllTags({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET TAG BY ID ===
  getTagById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.productTagService.getTagById(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET TAG LIST (FOR DROPDOWN) ===
  getTagList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.productTagService.getAllTagsList();
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE TAG ===
  updateTag = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateTagDTO;
      const result = await this.productTagService.updateTag(id, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE TAG ===
  deleteTag = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.productTagService.deleteTag(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === EXPORT TAGS TO EXCEL ===
  exportTags = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as TagExportQuery;

      const excelBuffer = await this.productTagService.exportTagsToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="data-tags-product-export.xlsx"',
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };
}
