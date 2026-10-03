import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import {
  CreateArticleBannerDTO,
  UpdateArticleBannerDTO,
} from "../dto/articleBanner.dto";
import { ArticleBannerService } from "./articleBanner.service";

@injectable()
export class ArticleBannerController {
  constructor(private readonly articleBannerService: ArticleBannerService) {}

  private getLang(req: Request): "id" | "en" {
    return req.query.lang === "en" ? "en" : "id";
  }

  createBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateArticleBannerDTO;

      const result = await this.articleBannerService.createBanner(body);

      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  getAllBanners = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, isActive } = req.query;

      const lang = this.getLang(req);

      const result = await this.articleBannerService.getAllBanners(
        {
          page: page ? Number(page) : undefined,
          take: take ? Number(take) : undefined,
          search: typeof search === "string" ? search : undefined,
          isActive: typeof isActive === "string" ? isActive : undefined,
        },
        lang,
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getBannerById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const result = await this.articleBannerService.getBannerById(id);

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  updateBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const body = req.body as UpdateArticleBannerDTO;

      const result = await this.articleBannerService.updateBanner(id, body);

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  deleteBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const result = await this.articleBannerService.deleteBanner(id);

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  getActiveBannersPublic = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const lang = this.getLang(req);

      const result =
        await this.articleBannerService.getActiveBannersPublic(lang);

      res.status(200).json({
        message: "Active banners fetched successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
