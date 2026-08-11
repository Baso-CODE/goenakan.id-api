import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { BannerProductService } from "./banner-product.service";
import { CreateBannerDto, UpdateBannerDto } from "./dto/banner-product.dto";

@injectable()
export class BannerProductController {
  constructor(private readonly bannerProductService: BannerProductService) {}

  // ====================================================================
  // 1. PUBLIC ENDPOINT (Untuk Landing Page / Client Web E-commerce)
  // ====================================================================
  getPublicBanners = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.bannerProductService.getPublicBanners();
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error); // Lempar error ke middleware penanganan error global
    }
  };

  // ====================================================================
  // 2. ADMIN ENDPOINTS (Backoffice / CMS Admin)
  // ====================================================================

  // --- GET ALL (Table Admin dengan Pagination & Filter) ---
  getAllBanners = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Menangkap semua query parameter dari URL
      const { page, take, search, isActive, startDate, endDate } = req.query;

      const result = await this.bannerProductService.getAllBanners({
        page: Number(page),
        take: Number(take),
        search: search as string,
        isActive: isActive as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // --- GET BY ID ---
  getBannerById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.bannerProductService.getBannerById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // --- CREATE ---
  createBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // req.body berisi teks (title, linkUrl, dll), req.file berisi gambar
      const body = req.body as CreateBannerDto;
      const file = req.file;

      const result = await this.bannerProductService.createBanner(body, file!);

      res.status(201).json({
        success: true,
        message: "Banner berhasil ditambahkan",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // --- UPDATE ---
  updateBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateBannerDto;
      const file = req.file;

      const result = await this.bannerProductService.updateBanner(
        id,
        body,
        file,
      );

      res.status(200).json({
        success: true,
        message: "Banner berhasil diperbarui",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // --- DELETE ---
  deleteBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.bannerProductService.deleteBanner(id);

      res.status(200).json({
        success: true,
        message: "Banner berhasil dihapus",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
