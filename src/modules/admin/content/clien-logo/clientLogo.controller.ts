import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { ClientLogoService } from "./clientLogo.service";
import { CreateClientLogoDTO, UpdateClientLogoDTO } from "./dto/clientLogo.dto";

@injectable()
export class ClientLogoController {
  constructor(private readonly clientLogoService: ClientLogoService) {}

  // === PUBLIC: GET ALL ACTIVE LOGOS ===
  getAllPublic = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // true = hanya ambil yang isActive: true
      const result = await this.clientLogoService.getAllLogos(true);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === ADMIN: GET TABLE DATA ===
  getAllAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, isActive } = req.query;
      const result = await this.clientLogoService.getAllLogosAdmin({
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
      const result = await this.clientLogoService.getLogoById(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // req.body sudah divalidasi dan diparsing oleh middleware
      const body = req.body as CreateClientLogoDTO;
      const file = req.file;

      if (!file) {
        res.status(400).json({ message: "Logo image file is required" });
        return;
      }

      const result = await this.clientLogoService.createLogo(body, file);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateClientLogoDTO;
      const file = req.file;

      // File bersifat opsional saat update (jika null, gambar lama dipertahankan)
      const result = await this.clientLogoService.updateLogo(id, body, file);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.clientLogoService.deleteLogo(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
