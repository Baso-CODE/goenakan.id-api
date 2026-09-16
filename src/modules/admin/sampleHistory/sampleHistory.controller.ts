import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { SampleHistoryService } from "./sampleHistory.service";

@injectable()
export class SampleHistoryController {
  constructor(private readonly sampleHistoryService: SampleHistoryService) {}

  // ====================================================================
  // 1. GET ALL SAMPLE HISTORY
  // ====================================================================
  getAllHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, take, search, status, startDate, endDate } = req.query;

      // Teruskan data query parameter ke Service
      const result = await this.sampleHistoryService.getAllSampleHistory({
        page: page && !isNaN(Number(page)) ? Number(page) : 1,
        take: take && !isNaN(Number(take)) ? Number(take) : 10,

        // Parsing string
        search: search ? String(search) : undefined,
        status: status ? String(status) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
      });

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // ====================================================================
  // 2. TRIGGER MANUAL: MARK AS RETURNED
  // ====================================================================
  markAsReturned = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Mengambil orderId dari parameter URL (misal: /api/sample-history/:orderId/return)
      const { orderId } = req.params;

      // Mengambil opsional notes dari body JSON
      const { notes } = req.body;

      const result = await this.sampleHistoryService.markSampleAsReturned(
        orderId,
        notes,
      );

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // ====================================================================
  // 3. GET SAMPLE SUMMARY
  // ====================================================================
  getSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.sampleHistoryService.getSampleSummary();
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // ====================================================================
  // 4. GET SAMPLE HISTORY BY ID (DETAIL)
  // ====================================================================
  getHistoryById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.sampleHistoryService.getSampleHistoryById(id);
      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // ====================================================================
  // 5. GET ALL PRODUCT SAMPLES (Halaman Awal)
  // ====================================================================
  getAllSampleProducts = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { page, take, search } = req.query;

      const result = await this.sampleHistoryService.getAllSampleProducts({
        page: page && !isNaN(Number(page)) ? Number(page) : 1,
        take: take && !isNaN(Number(take)) ? Number(take) : 10,
        search: search ? String(search) : undefined,
      });

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };

  // ====================================================================
  // 6. GET PRODUCT SAMPLE DETAIL (Detail per SKU)
  // ====================================================================
  getProductSampleDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // Mengambil productId dari parameter URL
      const { productId } = req.params;
      const result =
        await this.sampleHistoryService.getProductSampleDetail(productId);

      res.status(200).send(result);
    } catch (error) {
      next(error);
    }
  };
}
