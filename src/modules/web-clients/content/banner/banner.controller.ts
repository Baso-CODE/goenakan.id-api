import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { PopupBannerService } from "./banner.service";
import { CreatePopupBannerDTO, UpdatePopupBannerDTO } from "./dto/banner.dto";

@injectable()
export class PopupBannerController {
  constructor(private readonly popupBannerService: PopupBannerService) {}

  // === PUBLIC: GET ACTIVE BANNER ===
  getActive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.popupBannerService.getActiveBanner();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === ADMIN: GET ALL LIST ===
  getAllAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, isActive } = req.query;
      const result = await this.popupBannerService.getAllBannersAdmin({
        page: Number(page),
        take: Number(take),
        search: search as string,
        isActive: isActive as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.popupBannerService.getBannerById(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === CREATE (HANDLE MULTIPLE FILES) ===
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreatePopupBannerDTO;

      // Karena kita pakai upload.fields(), data ada di req.files (bukan req.file)
      // Kita perlu casting ke tipe Dictionary agar bisa akses key-nya
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!files || !files["desktopImage"] || !files["mobileImage"]) {
        res
          .status(400)
          .json({ message: "Both Desktop and Mobile images are required" });
        return;
      }

      // Format ulang agar sesuai interface di Service
      const fileData = {
        desktopImage: files["desktopImage"],
        mobileImage: files["mobileImage"],
      };

      const result = await this.popupBannerService.createBanner(body, fileData);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE (HANDLE MULTIPLE FILES) ===
  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdatePopupBannerDTO;

      // req.files bisa undefined jika user tidak upload gambar baru
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;

      const fileData = {
        desktopImage: files?.["desktopImage"],
        mobileImage: files?.["mobileImage"],
      };

      const result = await this.popupBannerService.updateBanner(
        id,
        body,
        fileData,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.popupBannerService.deleteBanner(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
