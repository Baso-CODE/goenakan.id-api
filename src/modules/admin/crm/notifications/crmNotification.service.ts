import { injectable, singleton } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { PrismaService } from "../../../prisma/prisma.service";
import { WhatsappService } from "../../../whatsapp/whatsapp.service";
import { CrmTemplateService } from "../templates/crmTemplate.service";
import { SendNotificationDTO } from "./dto/sendNotification.dto";

@singleton()
@injectable()
export class CrmNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly crmTemplateService: CrmTemplateService,
  ) {}

  /**
   * Helper normalisasi nomor HP ke format E.164 standar (628...)
   */
  private formatPhoneNumber(phone: string): string {
    if (!phone) return "";
    let cleaned = phone.replace(/[\s\-\(\)\+]/g, "").replace(/@c\.us$/i, "").replace(/@g\.us$/i, "");
    if (cleaned.startsWith("0")) {
      cleaned = "62" + cleaned.substring(1);
    }
    if (!cleaned.startsWith("62") && cleaned.length > 8) {
      cleaned = "62" + cleaned;
    }
    return cleaned;
  }

  /**
   * Mengirim notifikasi WhatsApp terpadu (Template CRM / Pesan Bebas + Media Lampiran)
   */
  async sendNotification(
    dto: SendNotificationDTO,
    file?: Express.Multer.File,
  ) {
    if (!dto.phoneNumber) {
      throw new ApiError("Nomor WhatsApp (phoneNumber) wajib diisi", 400);
    }

    const formattedPhone = this.formatPhoneNumber(dto.phoneNumber);
    if (!formattedPhone || formattedPhone.length < 10) {
      throw new ApiError("Format nomor WhatsApp tidak valid", 400);
    }

    // 1. Resolusi Pesan (Template CRM vs Pesan Bebas)
    let renderedMessage = "";

    if (dto.template) {
      const template = await this.crmTemplateService.findTemplateByIdentifier(dto.template);
      if (!template) {
        throw new ApiError(
          `Template "${dto.template}" tidak ditemukan di database Pengaturan CRM`,
          404,
        );
      }

      let content = template.content;
      if (dto.variables && typeof dto.variables === "object") {
        for (const [key, val] of Object.entries(dto.variables)) {
          // Replace placeholder {{variabel}} atau {variabel}
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}|\\{${escapedKey}\\}`, "gi");
          content = content.replace(regex, String(val ?? ""));
        }
      }
      renderedMessage = content;
    } else if (dto.message && dto.message.trim()) {
      renderedMessage = dto.message.trim();
    } else {
      throw new ApiError(
        "Wajib menyertakan salah satu antara 'template' (dari Pengaturan CRM) atau 'message' (teks langsung)",
        400,
      );
    }

    // 2. Resolusi Media / Lampiran (File upload / URL / Base64)
    let mediaInput: {
      url?: string;
      buffer?: Buffer;
      base64?: string;
      mimetype?: string;
      fileName?: string;
    } | null = null;

    if (file) {
      mediaInput = {
        buffer: file.buffer,
        mimetype: file.mimetype,
        fileName: file.originalname,
      };
    } else if (dto.mediaUrl) {
      mediaInput = {
        url: dto.mediaUrl,
        fileName: dto.fileName,
      };
    } else if (dto.mediaBase64) {
      mediaInput = {
        base64: dto.mediaBase64,
        fileName: dto.fileName,
      };
    }

    // 3. Pengiriman via WhatsApp Gateway
    let isSent = false;
    let errorMessage: string | null = null;

    try {
      if (mediaInput) {
        const caption = dto.mediaCaption || renderedMessage;
        isSent = await this.whatsappService.sendMediaMessage(
          formattedPhone,
          mediaInput,
          caption,
        );
      } else {
        isSent = await this.whatsappService.sendMessage(
          formattedPhone,
          renderedMessage,
        );
      }
    } catch (err: any) {
      console.error("Gagal mengirim WhatsApp Notification:", err);
      errorMessage = err?.message || "Gagal menghubungi WhatsApp client";
      isSent = false;
    }

    // 4. Pencatatan Audit Trail ke Database (WhatsappMessage)
    const dbMessage = await this.prisma.whatsappMessage.create({
      data: {
        phoneNumber: formattedPhone,
        message: renderedMessage,
        type: dto.category || "NOTIFICATION",
        orderId: dto.orderId || null,
        status: isSent ? "sent" : "failed",
        sentAt: isSent ? new Date() : null,
        error: isSent ? null : (errorMessage || "Gagal terkirim via WhatsApp"),
      },
    });

    // 5. Sinkronisasi ke Riwayat Lead CRM jika nomor terdaftar
    try {
      const existingLead = await this.prisma.crmLead.findFirst({
        where: {
          OR: [
            { phoneNumber: formattedPhone },
            { phoneNumber: `+${formattedPhone}` },
            { phoneNumber: formattedPhone.startsWith("62") ? `0${formattedPhone.slice(2)}` : formattedPhone },
          ],
        },
      });

      if (existingLead) {
        await this.prisma.crmLead.update({
          where: { id: existingLead.id },
          data: {
            lastMessage: renderedMessage,
            lastMessageAt: new Date(),
          },
        });
      }
    } catch (leadSyncErr) {
      console.warn("Sinkronisasi riwayat lead CRM dilewati:", leadSyncErr);
    }

    return {
      success: isSent,
      messageId: dbMessage.id,
      recipient: formattedPhone,
      category: dto.category || "GENERAL",
      referenceId: dto.referenceId,
      renderedMessage,
      hasMedia: !!mediaInput,
      sentAt: dbMessage.sentAt,
      status: dbMessage.status,
      error: dbMessage.error,
    };
  }
}
