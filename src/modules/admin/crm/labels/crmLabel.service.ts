import { injectable, singleton } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateCrmLabelDTO } from "./dto/createCrmLabel.dto";
import { UpdateCrmLabelDTO } from "./dto/updateCrmLabel.dto";

const DEFAULT_LABELS = [
  { name: "B2B Corporate", color: "#059669", description: "Klien perusahaan / B2B PO resmi", orderIndex: 1 },
  { name: "Repeat Order", color: "#2563eb", description: "Pelanggan loyal pemesanan berulang", orderIndex: 2 },
  { name: "Sample Request", color: "#9333ea", description: "Permintaan sampel produk atau katalog cetak", orderIndex: 3 },
  { name: "Komunitas / Event", color: "#d97706", description: "Pesanan kepanitiaan, komunitas, atau seragam acara", orderIndex: 4 },
  { name: "Urgent Deadline", color: "#e11d48", description: "Pesanan butuh penanganan kilat / deadline mepet", orderIndex: 5 },
  { name: "Pricelist Info", color: "#0891b2", description: "Tanya pricelist atau spesifikasi harga", orderIndex: 6 },
  { name: "Custom Printing", color: "#4f46e5", description: "Kebutuhan sablon / bordir / print kustom khusus", orderIndex: 7 },
  { name: "Reseller", color: "#0d9488", description: "Mitra agen atau reseller berkala", orderIndex: 8 },
];

@singleton()
@injectable()
export class CrmLabelService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mengambil semua label CRM beserta jumlah prospek yang menggunakannya
   */
  async getLabels() {
    let items = await this.prisma.crmLeadLabelConfig.findMany({
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    });

    // Auto-seed default jika tabel masih kosong
    if (items.length === 0) {
      for (const def of DEFAULT_LABELS) {
        await this.prisma.crmLeadLabelConfig.upsert({
          where: { name: def.name },
          update: {},
          create: def,
        });
      }
      items = await this.prisma.crmLeadLabelConfig.findMany({
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      });
    }

    // Ambil semua labels dari leads untuk menghitung frekuensi penggunaan secara akurat
    const allLeads = await this.prisma.crmLead.findMany({
      where: { labels: { not: null } },
      select: { labels: true },
    });

    const counts: Record<string, number> = {};
    for (const lead of allLeads) {
      if (!lead.labels) continue;
      try {
        const parsed = JSON.parse(lead.labels);
        if (Array.isArray(parsed)) {
          for (const l of parsed) {
            if (typeof l === "string") {
              counts[l.toLowerCase()] = (counts[l.toLowerCase()] || 0) + 1;
            }
          }
        }
      } catch {
        const split = lead.labels.split(",");
        for (const s of split) {
          const t = s.trim().toLowerCase();
          if (t) counts[t] = (counts[t] || 0) + 1;
        }
      }
    }

    return items.map((item) => ({
      ...item,
      leadCount: counts[item.name.toLowerCase()] || 0,
    }));
  }

  /**
   * Membuat label CRM baru
   */
  async createLabel(dto: CreateCrmLabelDTO) {
    const trimmedName = dto.name.trim();
    if (!trimmedName) {
      throw new ApiError("Nama label tidak boleh kosong", 400);
    }

    // Cek duplikasi (case-insensitive)
    const existing = await this.prisma.crmLeadLabelConfig.findFirst({
      where: { name: trimmedName },
    });

    if (existing) {
      throw new ApiError(`Label "${trimmedName}" sudah ada`, 409);
    }

    const maxOrder = await this.prisma.crmLeadLabelConfig.aggregate({
      _max: { orderIndex: true },
    });
    const nextOrder = (maxOrder._max.orderIndex || 0) + 1;

    return this.prisma.crmLeadLabelConfig.create({
      data: {
        name: trimmedName,
        color: dto.color?.trim() || "#059669",
        description: dto.description?.trim() || null,
        orderIndex: nextOrder,
      },
    });
  }

  /**
   * Memperbarui label CRM
   */
  async updateLabel(id: string, dto: UpdateCrmLabelDTO) {
    const existing = await this.prisma.crmLeadLabelConfig.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Label tidak ditemukan", 404);
    }

    const dataToUpdate: any = {};

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (!trimmedName) {
        throw new ApiError("Nama label tidak boleh kosong", 400);
      }

      // Cek apakah ada label lain dengan nama baru ini
      if (trimmedName.toLowerCase() !== existing.name.toLowerCase()) {
        const duplicate = await this.prisma.crmLeadLabelConfig.findFirst({
          where: {
            name: trimmedName,
            id: { not: id },
          },
        });
        if (duplicate) {
          throw new ApiError(`Label "${trimmedName}" sudah ada`, 409);
        }

        // Sinkronisasi update nama label pada semua data leads yang menyimpannya
        const leadsWithOldLabel = await this.prisma.crmLead.findMany({
          where: { labels: { contains: existing.name } },
          select: { id: true, labels: true },
        });

        for (const lead of leadsWithOldLabel) {
          if (!lead.labels) continue;
          try {
            const arr = JSON.parse(lead.labels);
            if (Array.isArray(arr)) {
              const updated = arr.map((item) =>
                item.toLowerCase() === existing.name.toLowerCase() ? trimmedName : item
              );
              await this.prisma.crmLead.update({
                where: { id: lead.id },
                data: { labels: JSON.stringify(updated) },
              });
            }
          } catch {
            // ignore JSON parse error
          }
        }
      }

      dataToUpdate.name = trimmedName;
    }

    if (dto.color !== undefined) {
      dataToUpdate.color = dto.color.trim();
    }

    if (dto.description !== undefined) {
      dataToUpdate.description = dto.description?.trim() || null;
    }

    return this.prisma.crmLeadLabelConfig.update({
      where: { id },
      data: dataToUpdate,
    });
  }

  /**
   * Menghapus label CRM
   */
  async deleteLabel(id: string) {
    const existing = await this.prisma.crmLeadLabelConfig.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Label tidak ditemukan", 404);
    }

    await this.prisma.crmLeadLabelConfig.delete({
      where: { id },
    });

    return {
      success: true,
      message: `Label "${existing.name}" berhasil dihapus`,
    };
  }
}
