import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CurrencyService } from "./currency.service";
import { CreateCurrencyDTO, UpdateCurrencyDTO } from "./dto/currency.dto";

@injectable()
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  // ==========================================
  // GET ALL (With Optional Search)
  // ==========================================
  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const search = req.query.search as string | undefined;
      const result = await this.currencyService.getAllCurrencies(search);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // GET ONE BY CODE
  // ==========================================
  getOne = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.params;
      const result = await this.currencyService.getCurrencyByCode(code);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // CREATE
  // ==========================================
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Body sudah divalidasi oleh middleware sebagai CreateCurrencyDTO
      const body = req.body as CreateCurrencyDTO;

      const result = await this.currencyService.createCurrency(body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // UPDATE
  // ==========================================
  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.params;
      const body = req.body as UpdateCurrencyDTO;

      const result = await this.currencyService.updateCurrency(code, body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // DELETE
  // ==========================================
  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.params;
      await this.currencyService.deleteCurrency(code);

      res.status(200).json({ message: "Currency deleted successfully" });
    } catch (error) {
      next(error);
    }
  };
}
