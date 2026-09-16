import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import {
  CreateSuccessStoryDTO,
  UpdateSuccessStoryDTO,
} from "./dto/successStory.dto";
import { SuccessStoryFiles, SuccessStoryService } from "./successStory.service";

@injectable()
export class SuccessStoryController {
  constructor(private readonly service: SuccessStoryService) {}

  // === FUNGSI PUBLIK ===

  // 1. Dapatkan semua cerita (dengan pagination & locale)
  getAllPublic = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const locale = (req.query.locale as string) || "id"; // Tangkap locale (?locale=en)
      const page = req.query.page ? Number(req.query.page) : 1; // Tangkap page (?page=2)

      const result = await this.service.getAllPublic(locale, page);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // 2. Dapatkan cerita berdasarkan Client ID
  getByClientPublic = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { clientId } = req.params; // Tangkap ID dari URL dinamis
      const locale = (req.query.locale as string) || "id";
      const page = req.query.page ? Number(req.query.page) : 1;

      const result = await this.service.getByClientPublic(
        clientId,
        locale,
        page,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // 3. Dapatkan detail cerita berdasarkan Slug
  getBySlugPublic = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = req.params; // Tangkap slug dari URL dinamis
      const locale = (req.query.locale as string) || "id";

      const result = await this.service.getBySlugPublic(slug, locale);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === FUNGSI ADMIN ===

  getAllAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search } = req.query;
      const result = await this.service.getAllAdmin({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.getById(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateSuccessStoryDTO;

      const result = await this.service.create(body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateSuccessStoryDTO;

      const reqFiles = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };
      const files: SuccessStoryFiles = {
        heroImage: reqFiles?.heroImage?.[0],
        media1: reqFiles?.media1?.[0],
        media2: reqFiles?.media2?.[0],
      };

      const result = await this.service.update(id, body, files);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.service.delete(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
