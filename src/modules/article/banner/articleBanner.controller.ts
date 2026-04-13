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

  // === CREATE BANNER ===
  createBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateArticleBannerDTO;
      const result = await this.articleBannerService.createBanner(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ALL BANNERS (UNTUK ADMIN) ===
  getAllBanners = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, isActive } = req.query;

      const result = await this.articleBannerService.getAllBanners({
        page: page ? Number(page) : undefined,
        take: take ? Number(take) : undefined,
        search: search as string,
        isActive: isActive as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET BANNER BY ID (UNTUK FORM EDIT ADMIN) ===
  getBannerById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.articleBannerService.getBannerById(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE BANNER ===
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

  // === DELETE BANNER ===
  deleteBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.articleBannerService.deleteBanner(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET ACTIVE BANNERS PUBLIC (UNTUK CAROUSEL CLIENT FRONTEND) ===
  getActiveBannersPublic = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // Tidak membutuhkan pagination karena carousel biasanya menarik data terbatas
      const result = await this.articleBannerService.getActiveBannersPublic();

      // Kirim dalam format standard API Anda
      res.status(200).json({
        message: "Active banners fetched successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
