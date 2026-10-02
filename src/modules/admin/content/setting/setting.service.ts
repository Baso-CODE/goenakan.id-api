import { injectable } from "tsyringe";

import { PrismaService } from "../../../prisma/prisma.service";
import { UpdateAppSettingDTO } from "./dto/setting.dto";

@injectable()
export class AppSettingService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicSettings() {
    return this.prisma.appSetting.findFirst({
      select: {
        googleAnalyticsId: true,
        googleAnalyticsEnabled: true,

        googleAdsId: true,
        googleAdsEnabled: true,

        gtmId: true,
        gtmEnabled: true,

        googleSiteVerification: true,

        pixelId: true,
        pixelEnabled: true,

        microsoftClarityId: true,
        microsoftClarityEnabled: true,
      },
    });
  }

  async getAdminSettings() {
    return this.prisma.appSetting.findFirst();
  }

  async saveSettings(data: UpdateAppSettingDTO) {
    const existing = await this.prisma.appSetting.findFirst();

    const settingData = {
      googleAnalyticsId: data.googleAnalyticsId,
      googleAnalyticsEnabled: data.googleAnalyticsEnabled,

      googleAdsId: data.googleAdsId,
      googleAdsEnabled: data.googleAdsEnabled,

      gtmId: data.gtmId,
      gtmEnabled: data.gtmEnabled,

      googleSiteVerification: data.googleSiteVerification,

      pixelId: data.pixelId,
      pixelEnabled: data.pixelEnabled,

      microsoftClarityId: data.microsoftClarityId,
      microsoftClarityEnabled: data.microsoftClarityEnabled,

      globalForeignPriceAdjuster: data.globalForeignPriceAdjuster,
    };

    if (existing) {
      return this.prisma.appSetting.update({
        where: {
          id: existing.id,
        },
        data: settingData,
      });
    }

    return this.prisma.appSetting.create({
      data: settingData,
    });
  }
}
