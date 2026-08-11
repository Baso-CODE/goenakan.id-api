import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { BrandClientService } from "./brandClient.service";
import { CreateBrandClientDTO } from "./dto/createBrandClient.dto";
import { UpdateBrandClientDTO } from "./dto/updateBrandClient.dto";

@injectable()
export class BrandClientController {
  constructor(private readonly brandClientService: BrandClientService) {}

  // ====================================================================
  // 1. PUBLIC ENDPOINT (Untuk Tampilan Website Utama)
  // ====================================================================
  getPublicClients = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.brandClientService.getPublicClients();
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // ====================================================================
  // 2. ADMIN ENDPOINTS (Backoffice Management)
  // ====================================================================

  // CREATE BRAND CLIENT
  createBrandClient = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const body = req.body as CreateBrandClientDTO;
      const file = req.file;

      const result = await this.brandClientService.createBrandClient(
        body,
        file!,
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // GET ALL FOR ADMIN (With Pagination & Search)
  getAllBrandClients = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search } = req.query;

      const result = await this.brandClientService.getAllBrandClients({
        page: Number(page),
        take: Number(take),
        search: search as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // GET BY ID
  getBrandClientById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.brandClientService.getBrandClientById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // UPDATE BRAND CLIENT
  updateBrandClient = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateBrandClientDTO;
      const file = req.file;

      const result = await this.brandClientService.updateBrandClient(
        id,
        body,
        file,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // DELETE BRAND CLIENT
  deleteBrandClient = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.brandClientService.deleteBrandClient(id);
      res.status(200).json({
        message: "Brand Client deleted successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
