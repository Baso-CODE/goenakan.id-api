import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { WhatsappService } from "./whatsapp.service";

@injectable()
export class WhatsappController {
  constructor(
    @inject(WhatsappService)
    private whatsappService: WhatsappService,
  ) {}

  async sendMessage(req: Request, res: Response) {
    try {
      const { phoneNumber, message } = req.body;

      if (!phoneNumber || !message) {
        return res.status(400).json({
          success: false,
          message: "Phone number and message required",
        });
      }

      const result = await this.whatsappService.sendMessage(
        phoneNumber,
        message,
      );

      return res.json({
        success: result,
        message: result ? "Message sent" : "Failed to send",
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, error: String(error) });
    }
  }

  async getStatus(req: Request, res: Response) {
    const status = await this.whatsappService.getStatus();
    return res.json({ status });
  }
}
