import { Router } from "express";
import { container, injectable } from "tsyringe";
import { WhatsappController } from "./whatsapp.controller";

@injectable()
export class WhatsappRouter {
  private router = Router();
  private whatsappController = container.resolve(WhatsappController);

  constructor() {
    this.router.post("/send", (req, res) =>
      this.whatsappController.sendMessage(req, res),
    );
    this.router.get("/status", (req, res) =>
      this.whatsappController.getStatus(req, res),
    );
  }

  getRouter() {
    return this.router;
  }
}
