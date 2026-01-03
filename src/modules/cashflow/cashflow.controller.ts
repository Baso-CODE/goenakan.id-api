import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CashflowService } from "./cashflow.service";

@injectable()
export class CashflowController {
  constructor(private readonly service: CashflowService) {}

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, startDate, endDate } = req.query;

      const result = await this.service.getAllCashflows({
        page: page ? Number(page) : 1,
        take: take ? Number(take) : 10,
        search: search as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getDetailByOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { orderId } = req.params;
      const result = await this.service.getCashflowDetail(orderId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  // SAVE / UPDATE Cashflow
  save = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.params;
      const data = req.body; // Pastikan body sesuai SaveCashflowDTO
      const result = await this.service.saveCashflow(orderId, data);
      res
        .status(200)
        .json({ message: "Cashflow saved successfully", ...result });
    } catch (error) {
      next(error);
    }
  };
}
