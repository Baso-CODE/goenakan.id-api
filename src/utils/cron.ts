// src/jobs/cron.ts
import cron from "node-cron";
import { container } from "tsyringe";
import { CrmLeadService } from "../modules/admin/crm/leads/crmLead.service";
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

  // Otomatis sinkronisasi pesan WhatsApp CRM setiap 15 menit (Safety-Net jika ada webhook yang terlewat)
  cron.schedule("*/15 * * * *", async () => {
    try {
      const crmLeadService = container.resolve(CrmLeadService);
      const result = await crmLeadService.syncLeadsFromWa();
      if (result.synced > 0) {
        console.log(
          `🕒 [CRM CRON] Berhasil menyinkronkan ${result.synced} chat (${result.created} baru, ${result.updated} diperbarui).`,
        );
      }
    } catch (err: any) {
      // Tidak melempar error agar worker cron tidak crash jika sesi belum dikonfigurasi
      if (!err.message?.includes("Belum ada sesi WhatsApp")) {
        console.warn(`⚠️ [CRM CRON WARNING]: ${err.message}`);
      }
    }
  });
}
