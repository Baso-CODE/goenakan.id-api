import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { TrackingService } from "./tracking.service";

@injectable()
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  /**
   * Endpoint Publik untuk melacak pesanan berdasarkan Nomor Pesanan & Kontak
   */
  trackOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderNumber, contactInfo } = req.body;

      // Validasi input dasar
      if (!orderNumber || !contactInfo) {
        return res.status(400).json({
          success: false,
          message: "Nomor pesanan dan Email atau No HP wajib diisi.",
        });
      }

      // Panggil Service untuk melacak data pesanan
      const result = await this.trackingService.trackOrder(
        orderNumber,
        contactInfo,
      );

      // Kembalikan respons data pelacakan
      return res.status(200).json({
        success: true,
        message: "Data pelacakan berhasil ditemukan",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
