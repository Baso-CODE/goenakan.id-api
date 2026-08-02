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
      // 1. Ekstrak data dari query URL
      const { orderId, replacementOrderId } = req.query;

      // 2. Validasi sederhana
      if (!orderId && !replacementOrderId) {
        throw new Error(
          "Parameter orderId atau replacementOrderId wajib disertakan",
        );
      }

      // 3. Teruskan ke service sebagai objek
      const result = await this.service.getCashflowDetail({
        orderId: orderId as string,
        replacementOrderId: replacementOrderId as string,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
  // SAVE / UPDATE Cashflow
  save = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Data ID dan Items semuanya sudah ada di dalam req.body berkat DTO baru
      const data = req.body;

      // 2. Teruskan data tersebut ke service
      const result = await this.service.saveCashflow(data);

      res
        .status(200)
        .json({ message: "Cashflow saved successfully", ...result });
    } catch (error) {
      next(error);
    }
  };
}
