// src/jobs/cron.ts
import cron from "node-cron";
import { container } from "tsyringe";
import { OrderService } from "../modules/admin/order/order.service";

export function initializeCronJobs() {
  console.log("⏳ [CRON] Menginisialisasi Cron Jobs...");

  const orderService = container.resolve(OrderService);

  cron.schedule("1 0 * * *", async () => {
    console.log(
      "🕒 [CRON EXECUTING] Menjalankan pengecekan garansi expired...",
    );
    await orderService.checkExpiredWarranties();
  });
}
