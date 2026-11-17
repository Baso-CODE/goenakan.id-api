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

    return updated;
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
