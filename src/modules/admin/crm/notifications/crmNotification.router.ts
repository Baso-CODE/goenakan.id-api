import { Request, Response, NextFunction, Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { CrmNotificationController } from "./crmNotification.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // Max 25MB attachment
});

@autoInjectable()
export class CrmNotificationRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly crmNotificationController: CrmNotificationController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Dual Auth: Mendukung header X-API-KEY (Server-to-Server) ATAU Bearer JWT NextAuth
    const dualAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
      const apiKey = req.headers["x-api-key"] || req.headers["x-service-key"];
      const configuredKey =
        process.env.INTERNAL_SERVICE_API_KEY ||
        process.env.ERP_SERVICE_API_KEY ||
        "goenakan-internal-erp-2026";

      if (apiKey && apiKey === configuredKey) {
        (req as any).user = { id: "system-erp", role: "SYSTEM" };
        return next();
      }

      // Jika tidak menggunakan API Key, verifikasi via NextAuth Token
      return this.nextAuthMiddleware.verifyNextAuthToken(req, res, next);
    };

    /**
     * @route POST /crm/notifications/send
     * @desc Kirim notifikasi WhatsApp terpadu (Template Pengaturan CRM / Raw Text + Media Attachment)
     */
    this.router.post(
      "/send",
      dualAuthMiddleware,
      upload.single("file"),
      this.crmNotificationController.sendNotification,
    );
  };

  public getRouter = (): Router => {
    return this.router;
  };
}
