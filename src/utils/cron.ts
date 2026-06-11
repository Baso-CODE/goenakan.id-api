// src/jobs/cron.ts
import cron from "node-cron";
import { container } from "tsyringe";
import { OrderService } from "../modules/order/order.service";

export function initializeCronJobs() {
  console.log("⏳ [CRON] Menginisialisasi Cron Jobs...");

  const orderService = container.resolve(OrderService);

  // Jadwal: Berjalan setiap jam 00:01 malam setiap hari
  // Format: Menit Jam Tanggal Bulan Hari-dalam-minggu
  cron.schedule("1 0 * * *", async () => {
    console.log(
      "🕒 [CRON EXECUTING] Menjalankan pengecekan garansi expired...",
    );
    await orderService.checkExpiredWarranties();
  });
}
