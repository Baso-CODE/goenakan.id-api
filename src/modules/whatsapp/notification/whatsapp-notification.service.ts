import { inject, injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { WhatsappService } from "../whatsapp.service";

interface NotificationPayload {
  phoneNumber: string;
  clientName: string;
  messageType: string;
  data: Record<string, any>;
}

@injectable()
export class WhatsappNotificationService {
  constructor(
    @inject(WhatsappService) private whatsappService: WhatsappService,
    @inject(PrismaService) private prisma: PrismaService,
  ) {}

  // 🔥 Template messages
  private templates = {
    order_created: (data: any) =>
      `
Halo ${data.clientName},

Pesanan baru telah dibuat dengan detail:
📋 Order ID: ${data.orderId}
📅 Tanggal: ${new Date(data.createdAt).toLocaleDateString("id-ID")}
💰 Total: Rp ${data.totalPrice?.toLocaleString("id-ID")}
📦 Produk: ${data.productCount} item

Terima kasih telah berbelanja bersama kami!

Regards,
Goenakan Team
    `.trim(),

    quotation_sent: (data: any) =>
      `
Halo ${data.clientName},

Quotation telah dikirimkan dengan detail:
📄 Quotation ID: ${data.quotationId}
📅 Berlaku hingga: ${new Date(data.validUntil).toLocaleDateString("id-ID")}
💰 Total: Rp ${data.totalPrice?.toLocaleString("id-ID")}

Silahkan review dan hubungi kami jika ada pertanyaan.

Regards,
Goenakan Team
    `.trim(),

    payment_reminder: (data: any) =>
      `
Halo ${data.clientName},

Pengingat pembayaran untuk Order ${data.orderId}
💰 Total Pembayaran: Rp ${data.totalPrice?.toLocaleString("id-ID")}
🏦 Rekening: [INSERT BANK ACCOUNT]
📅 Deadline: ${new Date(data.dueDate).toLocaleDateString("id-ID")}

Terima kasih atas perhatiannya.

Regards,
Goenakan Team
    `.trim(),

    order_updated: (data: any) =>
      `
Halo ${data.clientName},

Order ${data.orderId} telah diperbarui.
Status: ${data.status}
${data.remark ? `📝 Keterangan: ${data.remark}` : ""}

Silahkan hubungi kami untuk informasi lebih lanjut.

Regards,
Goenakan Team
    `.trim(),
  };

  /**
   * 🔥 Send notification & save ke database
   */
  async sendNotification(
    payload: NotificationPayload,
    orderId?: string,
    quotationId?: string,
  ) {
    try {
      const template =
        this.templates[payload.messageType as keyof typeof this.templates];

      if (!template) {
        throw new Error(`Template ${payload.messageType} tidak ditemukan`);
      }

      const message = template(payload.data);

      // 🔥 Save ke database dulu (sebelum send)
      const dbMessage = await this.prisma.whatsappMessage.create({
        data: {
          phoneNumber: payload.phoneNumber,
          message,
          type: payload.messageType,
          orderId: orderId || null,
          quotationId: quotationId || null,
          status: "pending",
        },
      });

      // 🔥 Send via WhatsApp
      const sent = await this.whatsappService.sendMessage(
        payload.phoneNumber,
        message,
      );

      // Update status
      if (sent) {
        await this.prisma.whatsappMessage.update({
          where: { id: dbMessage.id },
          data: {
            status: "sent",
            sentAt: new Date(),
          },
        });

        console.log(
          `✅ WhatsApp sent to ${payload.phoneNumber} for ${payload.messageType}`,
        );
        return { success: true, messageId: dbMessage.id };
      } else {
        await this.prisma.whatsappMessage.update({
          where: { id: dbMessage.id },
          data: {
            status: "failed",
            error: "Failed to send via WhatsApp",
          },
        });

        console.error(`❌ Failed to send WhatsApp to ${payload.phoneNumber}`);
        return { success: false, messageId: dbMessage.id };
      }
    } catch (error) {
      console.error("Notification error:", error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 🔥 Send to PIC (Person In Charge)
   */
  async notifyPic(
    picPhoneNumber: string,
    picName: string,
    messageType: string,
    data: any,
    orderId?: string,
  ) {
    const picTemplate = `
Halo ${picName},

Ada update baru:
${messageType === "new_order_assigned" ? `Pesanan baru telah di-assign kepada Anda` : ""}
📋 Order ID: ${data.orderId}
👤 Client: ${data.clientName}
📦 Produk: ${data.productCount} item

Harap segera follow up dengan client.

Regards,
Goenakan System
    `.trim();

    try {
      await this.prisma.whatsappMessage.create({
        data: {
          phoneNumber: picPhoneNumber,
          message: picTemplate,
          type: `${messageType}_pic`,
          orderId: orderId || null,
          status: "pending",
        },
      });

      const sent = await this.whatsappService.sendMessage(
        picPhoneNumber,
        picTemplate,
      );

      if (sent) {
        console.log(`✅ Notified PIC ${picName} (${picPhoneNumber})`);
      }
    } catch (error) {
      console.error(`Error notifying PIC: ${error}`);
    }
  }

  /**
   * 🔥 Retry failed messages (untuk cron job)
   */
  async retryFailedMessages() {
    try {
      const failedMessages = await this.prisma.whatsappMessage.findMany({
        where: {
          status: "failed",
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24h
          },
        },
        take: 10,
      });

      for (const msg of failedMessages) {
        const sent = await this.whatsappService.sendMessage(
          msg.phoneNumber,
          msg.message,
        );

        if (sent) {
          await this.prisma.whatsappMessage.update({
            where: { id: msg.id },
            data: { status: "sent", sentAt: new Date() },
          });
        }
      }

      console.log(`🔄 Retried ${failedMessages.length} failed messages`);
    } catch (error) {
      console.error("Retry failed messages error:", error);
    }
  }
}
