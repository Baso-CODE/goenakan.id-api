import { CrmAssignMethod } from "@prisma/client";
import { injectable, singleton } from "tsyringe";
import { PrismaService } from "../../../prisma/prisma.service";

export interface WaSessionItem {
  id: string;
  name: string;
  status: string;
  phoneNumber?: string | null;
  me?: {
    id?: string;
    pushName?: string;
  } | null;
}

@singleton()
@injectable()
export class CrmSettingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    let setting = await this.prisma.crmSetting.findUnique({
      where: { id: "default" },
    });

    if (!setting) {
      setting = await this.prisma.crmSetting.create({
        data: {
          id: "default",
          ignoreGroups: true,
          ignoreBroadcasts: true,
          defaultAssignMethod: CrmAssignMethod.CLAIM,
          slaThresholdMinutes: 15,
        },
      });
    }

    return setting;
  }

  async updateSettings(data: {
    leadReceiverSessionId?: string;
    leadReceiverPhone?: string;
    ignoreGroups?: boolean;
    ignoreBroadcasts?: boolean;
    defaultAssignMethod?: CrmAssignMethod;
    slaThresholdMinutes?: number;
    blacklistedNumbers?: string;
  }) {
    const updated = await this.prisma.crmSetting.upsert({
      where: { id: "default" },
      update: {
        ...(data.leadReceiverSessionId !== undefined && { leadReceiverSessionId: data.leadReceiverSessionId }),
        ...(data.leadReceiverPhone !== undefined && { leadReceiverPhone: data.leadReceiverPhone }),
        ...(data.ignoreGroups !== undefined && { ignoreGroups: data.ignoreGroups }),
        ...(data.ignoreBroadcasts !== undefined && { ignoreBroadcasts: data.ignoreBroadcasts }),
        ...(data.defaultAssignMethod !== undefined && { defaultAssignMethod: data.defaultAssignMethod }),
        ...(data.slaThresholdMinutes !== undefined && { slaThresholdMinutes: data.slaThresholdMinutes }),
        ...(data.blacklistedNumbers !== undefined && { blacklistedNumbers: data.blacklistedNumbers }),
      },
      create: {
        id: "default",
        leadReceiverSessionId: data.leadReceiverSessionId || null,
        leadReceiverPhone: data.leadReceiverPhone || null,
        ignoreGroups: data.ignoreGroups ?? true,
        ignoreBroadcasts: data.ignoreBroadcasts ?? true,
        defaultAssignMethod: data.defaultAssignMethod ?? CrmAssignMethod.CLAIM,
        slaThresholdMinutes: data.slaThresholdMinutes ?? 15,
        blacklistedNumbers: data.blacklistedNumbers || null,
      },
    });

    // Otomatis daftarkan subscription webhook jika sesi penerima diaktifkan
    if (data.leadReceiverSessionId) {
      this.subscribeWebhook().catch((err) => {
        console.warn(`⚠️ [CRM Webhook Auto-Subscribe]: ${err.message}`);
      });
    }

    return updated;
  }

  /**
   * Mendaftarkan webhook endpoint CRM ke Catha WA API subscription registry
   */
  async subscribeWebhook(targetUrl?: string): Promise<{ success: boolean; message: string; data?: any }> {
    const baseUrl = process.env.WA_API_URL || "https://wa-api.goenakan.id";
    const apiKey = process.env.WA_API_KEY || "catha_secret_key_change_me";
    const webhookUrl =
      targetUrl ||
      process.env.API_PUBLIC_URL ||
      "https://api.goenakan.tech/crm/leads/webhook";

    try {
      // 1. Cek subscription yang sudah ada
      const listRes = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/webhooks/subscriptions`, {
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(6000),
      });

      if (listRes.ok) {
        const listData = await listRes.json();
        const items = Array.isArray(listData) ? listData : Array.isArray(listData?.data) ? listData.data : [];
        const existing = items.find((sub: any) => sub.url === webhookUrl && sub.isActive !== false);
        if (existing) {
          return {
            success: true,
            message: "Webhook subscription sudah aktif di WhatsApp Gateway",
            data: existing,
          };
        }
      }

      // 2. Daftarkan webhook baru jika belum ada
      const postRes = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/webhooks/subscriptions`, {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: webhookUrl,
          events: ["message.incoming"],
        }),
        signal: AbortSignal.timeout(8000),
      });

      const json = await postRes.json().catch(() => null);
      if (postRes.ok) {
        return {
          success: true,
          message: "Webhook real-time berhasil didaftarkan ke WhatsApp Gateway",
          data: json,
        };
      }

      return {
        success: false,
        message: json?.message || "Gagal mendaftarkan webhook subscription",
        data: json,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || "Gagal menghubungi Catha WA API",
      };
    }
  }

  async getAvailableSessions(): Promise<WaSessionItem[]> {
    const baseUrl = process.env.WA_API_URL || "https://wa-api.goenakan.id";
    const apiKey = process.env.WA_API_KEY || "catha_secret_key_change_me";

    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/sessions`, {
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        return [];
      }

      const json = await res.json();
      const sessions = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      return sessions;
    } catch {
      return [];
    }
  }
}
