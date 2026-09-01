import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateHeroSlideDTO, UpdateHeroSlideDTO } from "./dto/hero.dto";
import { HeroService, HeroSlideFiles } from "./hero.service";

@injectable()
export class HeroController {
  constructor(private readonly heroService: HeroService) {}

  getAllPublic = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.heroService.getAllSlides(true);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getAllAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, isActive } = req.query;
      const result = await this.heroService.getAllSlidesAdmin({
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
      const result = await this.heroService.getSlideById(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateHeroSlideDTO;

      // Ambil file dari request fields
      const reqFiles = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };
      const files: HeroSlideFiles = {
        imageDesktop: reqFiles?.imageDesktop?.[0],
        imageMobile: reqFiles?.imageMobile?.[0],
        imageTablet: reqFiles?.imageTablet?.[0],
      };

      if (!files.imageDesktop || !files.imageMobile) {
        res
          .status(400)
          .json({ message: "Desktop and Mobile image files are required" });
        return;
      }

      const result = await this.heroService.createSlide(body, files);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateHeroSlideDTO;

      const reqFiles = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };
      const files: HeroSlideFiles = {
        imageDesktop: reqFiles?.imageDesktop?.[0],
        imageMobile: reqFiles?.imageMobile?.[0],
        imageTablet: reqFiles?.imageTablet?.[0],
      };

      const result = await this.heroService.updateSlide(id, body, files);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.heroService.deleteSlide(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
