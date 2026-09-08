import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreatePortfolioDTO } from "./dto/createPorfolio.dto";
import { UpdatePortfolioDTO } from "./dto/updatePorfolio.dto";
import { PortfolioService } from "./portfolio.service";

@injectable()
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  // ====================================================================
  // 1. PUBLIC ENDPOINT (Untuk Landing Page / User Publik)
  // ====================================================================
  getPublicPortfolios = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // ✨ Ambil parameter lang dari query (default ke 'id')
      const { lang } = req.query;
      const targetLang = (lang as string) || "id";

      const result =
        await this.portfolioService.getPublicPortfolios(targetLang);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // ====================================================================
  // 2. ADMIN ENDPOINTS (Backoffice)
  // ====================================================================

  // --- GET ALL (Table Admin) ---
  getAllPortfolios = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search } = req.query;

      const result = await this.portfolioService.getAllPortfolios({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // --- GET BY ID ---
  getPortfolioById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.portfolioService.getPortfolioById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // --- CREATE ---
  createPortfolio = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreatePortfolioDTO;
      const file = req.file;
      const result = await this.portfolioService.createPortfolio(body, file!);

      res.status(201).json({
        success: true,
        message: "Portfolio berhasil ditambahkan",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // --- UPDATE ---
  updatePortfolio = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdatePortfolioDTO;
      const file = req.file;

      const result = await this.portfolioService.updatePortfolio(
        id,
        body,
        file,
      );

      res.status(200).json({
        success: true,
        message: "Portfolio berhasil diperbarui",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // --- DELETE ---
  deletePortfolio = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.portfolioService.deletePortfolio(id);

      res.status(200).json({
        success: true,
        message: "Portfolio berhasil dihapus",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
