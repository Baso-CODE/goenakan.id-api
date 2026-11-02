import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { AuthenticatedRequest } from "../../../middleware/AuthenticatedUser";
import {
  MatchWhatsappLeadDTO,
  MatchWhatsappOrderDTO,
  MatchWhatsappQuotationDTO,
} from "./dto/match-whatsapp-click.dto";
import { CreateWhatsappClickDTO } from "./dto/whatsapp-click.dto";
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

  createWhatsappClick = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // Batasi ukuran payload.
      const payloadSize = Buffer.byteLength(
        JSON.stringify(req.body ?? {}),
        "utf8",
      );

      if (payloadSize > 10_000) {
        return res.status(413).json({
          success: false,
          message: "Payload tracking terlalu besar.",
        });
      }

      const dto = plainToInstance(CreateWhatsappClickDTO, req.body);

      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      });

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Data WhatsApp tracking tidak valid.",
          errors: errors.map((error) => ({
            property: error.property,
            constraints: error.constraints,
          })),
        });
      }

      await this.trackingService.createWhatsappClick(dto);

      // Kontrak marketing: berhasil = 204 tanpa body.
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  matchWhatsappClick = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // ==========================================
      // 1. AUTHENTICATION
      // ==========================================

      const user = (req as AuthenticatedRequest).user;

      if (!user?.id) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      // ==========================================
      // 2. VALIDATE TARGET TYPE
      // ==========================================

      const { targetType } = req.params;

      if (
        targetType !== "lead" &&
        targetType !== "quotation" &&
        targetType !== "order"
      ) {
        return res.status(400).json({
          success: false,
          message: "Jenis target tidak valid.",
        });
      }

      // ==========================================
      // 3. VALIDATE DTO & BUILD TARGET
      // ==========================================

      let code: string;

      let target:
        | { type: "lead"; id: number }
        | { type: "quotation"; id: string }
        | { type: "order"; id: string };

      if (targetType === "lead") {
        const dto = plainToInstance(MatchWhatsappLeadDTO, req.body);

        const errors = await validate(dto, {
          whitelist: true,
          forbidNonWhitelisted: true,
          forbidUnknownValues: true,
        });

        if (errors.length > 0) {
          return res.status(400).json({
            success: false,
            message: "Data pencocokan lead tidak valid.",
          });
        }

        code = dto.code;

        target = {
          type: "lead",
          id: dto.leadId,
        };
      } else if (targetType === "quotation") {
        const dto = plainToInstance(MatchWhatsappQuotationDTO, req.body);

        const errors = await validate(dto, {
          whitelist: true,
          forbidNonWhitelisted: true,
          forbidUnknownValues: true,
        });

        if (errors.length > 0) {
          return res.status(400).json({
            success: false,
            message: "Data pencocokan quotation tidak valid.",
          });
        }

        code = dto.code;

        target = {
          type: "quotation",
          id: dto.quotationId,
        };
      } else {
        const dto = plainToInstance(MatchWhatsappOrderDTO, req.body);

        const errors = await validate(dto, {
          whitelist: true,
          forbidNonWhitelisted: true,
          forbidUnknownValues: true,
        });

        if (errors.length > 0) {
          return res.status(400).json({
            success: false,
            message: "Data pencocokan order tidak valid.",
          });
        }

        code = dto.code;

        target = {
          type: "order",
          id: dto.orderId,
        };
      }

      // ==========================================
      // 4. MATCH WHATSAPP CLICK
      // ==========================================

      const result = await this.trackingService.matchWhatsappClick(
        code,
        target,
        user.id,
      );

      // ==========================================
      // 5. SUCCESS RESPONSE
      // ==========================================

      return res.status(200).json({
        success: true,
        message: "Kode WhatsApp berhasil dicocokkan.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
