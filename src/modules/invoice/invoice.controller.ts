// src/modules/invoice/invoice.controller.ts
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CreateInvoiceDTO } from "./dto/createInvoice.dto";
import { PayInvoiceDTO } from "./dto/updateInvoice.dto";
import { InvoiceService } from "./invoice.service";

@injectable()
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  createInvoice = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new Error("Unauthorized: User ID missing");
      }

      const dto: CreateInvoiceDTO = req.body;

      const result = await this.invoiceService.createInvoice(userId, dto);

      res.status(201).json({
        message: "Invoice created successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  pay = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params; // Invoice ID dari URL
      const dto: PayInvoiceDTO = req.body;

      const result = await this.invoiceService.payInvoice(id, dto);

      res.status(200).json({
        message: "Payment recorded successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, status, category, startDate, endDate } =
        req.query;

      const result = await this.invoiceService.getAllInvoices({
        page: page && !isNaN(Number(page)) ? Number(page) : 1,
        take: take && !isNaN(Number(take)) ? Number(take) : 10,

        search: search ? String(search) : undefined,

        status: status && String(status) !== "ALL" ? String(status) : undefined,
        category:
          category && String(category) !== "ALL" ? String(category) : undefined,

        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getDetailInvoiceById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { id } = req.params;
      const result = await this.invoiceService.getInvoiceDetail(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
