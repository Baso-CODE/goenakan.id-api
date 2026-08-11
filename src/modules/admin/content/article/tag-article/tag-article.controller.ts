import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import {
  CreateArticleTagDTO,
  UpdateArticleTagDTO,
} from "../dto/tag-article.dto";
import {
  ArticleTagExportQuery,
  ArticleTagService,
} from "./tag-article.service";

@injectable()
export class ArticleTagController {
  constructor(private readonly articleTagService: ArticleTagService) {}

  // === CREATE TAG ===
  createTag = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateArticleTagDTO;
      const result = await this.articleTagService.createTag(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL TAGS (With Pagination) ===
  getAllTags = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search } = req.query;

      const result = await this.articleTagService.getAllTags({
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
      const result = await this.articleTagService.getTagById(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET TAG LIST (Untuk Dropdown/Multi-select di Form Artikel) ===
  getTagList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.articleTagService.getAllTagsList();
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE TAG ===
  updateTag = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateArticleTagDTO;
      const result = await this.articleTagService.updateTag(id, body);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE TAG ===
  deleteTag = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.articleTagService.deleteTag(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === EXPORT TO EXCEL ===
  exportTags = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as ArticleTagExportQuery;

      const excelBuffer = await this.articleTagService.exportTagsToExcel(query);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="data-tag-artikel-export.xlsx"',
      );
      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  };
}
