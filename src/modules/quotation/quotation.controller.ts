import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateFollowUpDTO } from "./dto/follow-up.dto";
import { CreateQuotationDTO, UpdateQuotationDTO } from "./dto/quotation.dto";
import { QuotationService } from "./quatation.service";

@injectable()
export class QuotationController {
  constructor(private readonly quotationService: QuotationService) {}

  // =================================================================
  // MAIN QUOTATION CRUD
  // =================================================================

  // === GET ALL (Pagination, Filter, Search) ===
  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, status } = req.query;

      const result = await this.quotationService.getAllQuotations({
        page: Number(page),
        take: Number(take),
        search: search as string,
        status: status as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET BY ID ===
  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.quotationService.getQuotationById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === CREATE ===
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Body sudah divalidasi oleh middleware validateBody(CreateQuotationDTO)
      const body = req.body as CreateQuotationDTO;
      const result = await this.quotationService.createQuotation(body);

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === UPDATE ===
  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateQuotationDTO;

      const result = await this.quotationService.updateQuotation(id, body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === DELETE ===
  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.quotationService.deleteQuotation(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // =================================================================
  // FOLLOW UP FEATURES
  // =================================================================

  // === ADD FOLLOW UP ===
  addFollowUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params; // ID Quotation
      const body = req.body as CreateFollowUpDTO;

      const result = await this.quotationService.addFollowUp(id, body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET FOLLOW UP HISTORY ===
  getFollowUps = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params; // ID Quotation
      const result = await this.quotationService.getFollowUps(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // === GET FOR PRINT ===
  getForPrint = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const result = await this.quotationService.getQuotationByIdForPrint(id);

      res.status(200).json({
        message: "Success fetch quotation for print",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
