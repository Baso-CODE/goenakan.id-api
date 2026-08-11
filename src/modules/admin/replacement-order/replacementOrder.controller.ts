import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import {
  CreateReplacementOrderDTO,
  UpdateReplacementOrderDTO,
} from "./dto/replacement-order.dto";
import { ReplacementOrderService } from "./replacementOrder.service";

@injectable()
export class ReplacementOrderController {
  constructor(
    private readonly replacementOrderService: ReplacementOrderService,
  ) {}

  // ==========================================
  // CREATE REPLACEMENT ORDER
  // ==========================================
  createReplacementOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const body = req.body as CreateReplacementOrderDTO;

      const userId = (req as any).user?.id;

      if (!userId) {
        return res
          .status(401)
          .json({ message: "Unauthorized: User ID not found" });
      }

      const result = await this.replacementOrderService.createReplacementOrder(
        body,
        userId,
      );

      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // UPDATE REPLACEMENT ORDER
  // ==========================================
  updateReplacementOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateReplacementOrderDTO;

      const userId = (req as any).user?.id;

      if (!userId) {
        return res
          .status(401)
          .json({ message: "Unauthorized: User ID not found" });
      }

      // Memanggil service
      const result = await this.replacementOrderService.updateReplacementOrder(
        id,
        body,
        userId,
      );

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // GET ALL REPLACEMENT ORDERS (TABLE LIST)
  // ==========================================
  getAllReplacementOrders = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search, startDate, endDate } = req.query;

      const result = await this.replacementOrderService.getAllReplacementOrders(
        {
          page: page && !isNaN(Number(page)) ? Number(page) : 1,
          take: take && !isNaN(Number(take)) ? Number(take) : 10,

          // Filter pencarian
          search: search ? String(search) : undefined,

          // Filter tanggal
          startDate: startDate ? String(startDate) : undefined,
          endDate: endDate ? String(endDate) : undefined,
        },
      );

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // GET REPLACEMENT ORDER BY ID
  // ==========================================
  getReplacementOrderById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result =
        await this.replacementOrderService.getReplacementOrderById(id);

      res.status(200).send({ data: result });
    } catch (error) {
      next(error);
    }
  };
}
