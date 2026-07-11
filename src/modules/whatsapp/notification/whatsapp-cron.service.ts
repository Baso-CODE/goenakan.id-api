import * as cron from "node-cron";
import { inject, injectable } from "tsyringe";
import { WhatsappNotificationService } from "./whatsapp-notification.service";

@injectable()
export class WhatsappCronService {
  constructor(
    @inject(WhatsappNotificationService)
    private whatsappNotification: WhatsappNotificationService,
  ) {}

  startJobs() {
    cron.schedule("*/30 * * * *", async () => {
      console.log("🔄 Running WhatsApp retry job...");
      await this.whatsappNotification.retryFailedMessages();
    });

    console.log("✅ WhatsApp cron jobs started");
  }
}
