import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { AuthenticatedRequest } from "../../../middleware/AuthenticatedUser";
import { CreatePurchaseOrderDTO } from "./dto/createPurchaseOrder.dto";
import { UpdatePurchaseOrderDTO } from "./dto/updatePurchaseOrder.dto";
import { PurchaseOrderService } from "./purchaseOrder.service";

@injectable()
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  // ====================================================================
  // 1. CREATE PURCHASE ORDER
  // ====================================================================
  createPurchaseOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const body = req.body as CreatePurchaseOrderDTO;

      const authUser = (req as AuthenticatedRequest).user;

      if (authUser && authUser.id) {
        body.createdById = authUser.id;
        console.log("🛠️ Menyisipkan createdById ke body:", body.createdById);
      }

      const result = await this.purchaseOrderService.createPurchaseOrder(body);
      res.status(201).send(result);
    } catch (error) {
      next(error);
    }
  };
  // ====================================================================
  // 2. UPDATE PURCHASE ORDER
  // ====================================================================
  updatePurchaseOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdatePurchaseOrderDTO;

      // Ambil ID user yang login untuk Audit Trail (Updated By)
      const authorId = (req as any).user?.id;
      if (authorId) {
        (body as any).updatedById = authorId;
      }

      const result = await this.purchaseOrderService.updatePurchaseOrder(
        id,
        body,
      );

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // ====================================================================
  // 3. GET ALL PURCHASE ORDERS (WITH FILTER & PAGINATION)
  // ====================================================================
  getAllPurchaseOrders = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const {
        page,
        take,
        search,
        purchaseType,
        expenseCategory,
        status,
        startDate,
        endDate,
      } = req.query;

      const result = await this.purchaseOrderService.getAllPurchaseOrders({
        // Handle pagination
        page: page && !isNaN(Number(page)) ? Number(page) : 1,
        take: take && !isNaN(Number(take)) ? Number(take) : 10,

        // Handle string filtering
        search: search ? String(search) : undefined,

        // Handle ENUM filtering (Pastikan Frontend mengirim string 'ALL' jika tidak ada filter)
        purchaseType:
          purchaseType && String(purchaseType) !== "ALL"
            ? String(purchaseType)
            : undefined,

        expenseCategory:
          expenseCategory && String(expenseCategory) !== "ALL"
            ? String(expenseCategory)
            : undefined,

        status: status && String(status) !== "ALL" ? String(status) : undefined,

        // Handle Date filtering
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
      });

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // ====================================================================
  // 4. GET PURCHASE ORDER BY ID
  // ====================================================================
  getPurchaseOrderById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.purchaseOrderService.getPurchaseOrderById(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
