import { Request, Response } from "express";
import { injectable } from "tsyringe";
import { CrmNotificationService } from "./crmNotification.service";
import { SendNotificationDTO } from "./dto/sendNotification.dto";

@injectable()
export class CrmNotificationController {
  constructor(
    private readonly crmNotificationService: CrmNotificationService,
  ) {}

  sendNotification = async (req: Request, res: Response) => {
    try {
      const body = { ...req.body } as SendNotificationDTO;

      // Jika variables dikirim sebagai string JSON (misal saat multipart/form-data)
      if (typeof body.variables === "string") {
        try {
          body.variables = JSON.parse(body.variables);
        } catch {
          // ignore parsing error, pass as is
        }
      }

      const result = await this.crmNotificationService.sendNotification(
        body,
        req.file,
      );

      return res.status(200).json({
        success: true,
        message: result.success
          ? "Notifikasi WhatsApp berhasil dikirim"
          : "Notifikasi dicatat tetapi WhatsApp gateway belum terhubung",
        data: result,
      });
    } catch (error: any) {
      console.error("CrmNotificationController error:", error);
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        message: error.message || "Gagal memproses notifikasi WhatsApp",
        error: error.message,
      });
    }
  };
}
