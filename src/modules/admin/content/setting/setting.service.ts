import { injectable } from "tsyringe";
import { PrismaService } from "../../../prisma/prisma.service";
import { UpdateAppSettingDTO } from "./dto/setting.dto";

@injectable()
export class AppSettingService {
  constructor(private readonly prisma: PrismaService) {}

  // === GET SETTINGS (SINGLETON) ===
  // Mengambil satu-satunya data setting yang ada di database
  async getSettings() {
    const settings = await this.prisma.appSetting.findFirst();
    return settings;
  }

  // === SAVE SETTINGS (UPSERT LOGIC) ===
  // Logic: "Update if exists, Create if not"
  async saveSettings(data: UpdateAppSettingDTO) {
    // 1. Cek apakah data sudah ada?
    const existing = await this.prisma.appSetting.findFirst();

    if (existing) {
      // 2a. Jika SUDAH ADA -> Lakukan UPDATE
      // Kita update berdasarkan ID yang ditemukan
      return await this.prisma.appSetting.update({
        where: { id: existing.id },
        data: {
          googleAdsId: data.googleAdsId,
          gtmId: data.gtmId,
          pixelId: data.pixelId,
          globalForeignPriceAdjuster: data.globalForeignPriceAdjuster,
        },
      });
    } else {
      // 2b. Jika BELUM ADA (Kosong) -> Lakukan CREATE baru
      return await this.prisma.appSetting.create({
        data: {
          googleAdsId: data.googleAdsId,
          gtmId: data.gtmId,
          pixelId: data.pixelId,
          globalForeignPriceAdjuster: data.globalForeignPriceAdjuster,
        },
      });
    }
  }
}
