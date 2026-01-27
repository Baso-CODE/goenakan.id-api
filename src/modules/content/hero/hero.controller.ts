import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateHeroSlideDTO, UpdateHeroSlideDTO } from "./dto/hero.dto";
import { HeroService } from "./hero.service";

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
      // req.body sudah divalidasi dan diparsing oleh middleware
      const body = req.body as CreateHeroSlideDTO;
      const file = req.file;

      if (!file) {
        res.status(400).json({ message: "Image file is required" });
        return;
      }

      const result = await this.heroService.createSlide(body, file);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateHeroSlideDTO;
      const file = req.file;

      const result = await this.heroService.updateSlide(id, body, file);
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
