import { injectable, singleton } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateCrmStatusDTO } from "./dto/createCrmStatus.dto";
import { UpdateCrmStatusDTO } from "./dto/updateCrmStatus.dto";

const DEFAULT_STATUSES = [
  { key: "NEW", label: "Lead Baru", color: "#2563eb", orderIndex: 1, isDefault: true, isWon: false, isLost: false },
  { key: "IN_PROGRESS", label: "Follow Up", color: "#d97706", orderIndex: 2, isDefault: false, isWon: false, isLost: false },
  { key: "QUOTATION_SENT", label: "Quotation Terkirim", color: "#9333ea", orderIndex: 3, isDefault: false, isWon: false, isLost: false },
  { key: "WON", label: "Deal / SPK Terbit", color: "#059669", orderIndex: 4, isDefault: false, isWon: true, isLost: false },
  { key: "LOST", label: "Batal / Lost", color: "#e11d48", orderIndex: 5, isDefault: false, isWon: false, isLost: true },
  { key: "CLOSED", label: "Selesai", color: "#4b5563", orderIndex: 6, isDefault: false, isWon: false, isLost: false },
];

@singleton()
@injectable()
export class CrmStatusService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper normalisasi slug key (contoh: "Kirim Sampel" -> "KIRIM_SAMPEL")
   */
  private generateKey(input: string): string {
    return input
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  /**
   * Ambil semua konfigurasi status lead berurutan berdasarkan orderIndex
   */
  async getStatuses() {
    let items = await this.prisma.crmLeadStatusConfig.findMany({
      orderBy: { orderIndex: "asc" },
      include: {
        _count: {
          select: { leads: true },
        },
      },
    });

    // Auto-seed status default jika tabel masih kosong
    if (items.length === 0) {
      for (const def of DEFAULT_STATUSES) {
        await this.prisma.crmLeadStatusConfig.upsert({
          where: { key: def.key },
          update: {},
          create: def,
        });
      }
      items = await this.prisma.crmLeadStatusConfig.findMany({
        orderBy: { orderIndex: "asc" },
        include: {
          _count: {
            select: { leads: true },
          },
        },
      });
    }

    return items;
  }

  /**
   * Tambah status lead kustom baru
   */
  async createStatus(dto: CreateCrmStatusDTO) {
    const rawKey = dto.key?.trim() ? dto.key : dto.label;
    const key = this.generateKey(rawKey);

    if (!key) {
      throw new ApiError("Kode status (key) tidak valid", 400);
    }

    const existing = await this.prisma.crmLeadStatusConfig.findUnique({
      where: { key },
    });
    if (existing) {
      throw new ApiError(`Kode status "${key}" sudah digunakan`, 400);
    }

    const maxOrder = await this.prisma.crmLeadStatusConfig.aggregate({
      _max: { orderIndex: true },
    });
    const nextOrder = (maxOrder._max.orderIndex || 0) + 1;

    return await this.prisma.crmLeadStatusConfig.create({
      data: {
        key,
        label: dto.label.trim(),
        color: dto.color?.trim() || "#2563eb",
        orderIndex: nextOrder,
        isDefault: !!dto.isDefault,
        isWon: !!dto.isWon,
        isLost: !!dto.isLost,
      },
      include: {
        _count: {
          select: { leads: true },
        },
      },
    });
  }

  /**
   * Perbarui label, warna, atau tipe status
   */
  async updateStatus(id: string, dto: UpdateCrmStatusDTO) {
    const existing = await this.prisma.crmLeadStatusConfig.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new ApiError("Konfigurasi status tidak ditemukan", 404);
    }

    return await this.prisma.crmLeadStatusConfig.update({
      where: { id },
      data: {
        label: dto.label !== undefined ? dto.label.trim() : undefined,
        color: dto.color !== undefined ? dto.color.trim() : undefined,
        isWon: dto.isWon !== undefined ? dto.isWon : undefined,
        isLost: dto.isLost !== undefined ? dto.isLost : undefined,
        isDefault: dto.isDefault !== undefined ? dto.isDefault : undefined,
        orderIndex: dto.orderIndex !== undefined ? dto.orderIndex : undefined,
      },
      include: {
        _count: {
          select: { leads: true },
        },
      },
    });
  }

  /**
   * Hapus status (dicegah bila masih digunakan oleh lead)
   */
  async deleteStatus(id: string) {
    const existing = await this.prisma.crmLeadStatusConfig.findUnique({
      where: { id },
      include: {
        _count: {
          select: { leads: true },
        },
      },
    });

    if (!existing) {
      throw new ApiError("Konfigurasi status tidak ditemukan", 404);
    }

    if (existing.isDefault || existing.key === "NEW") {
      throw new ApiError("Status default prospek baru tidak dapat dihapus", 400);
    }

    if (existing._count.leads > 0) {
      throw new ApiError(
        `Status "${existing.label}" masih digunakan oleh ${existing._count.leads} prospek/lead. Pindahkan status lead terlebih dahulu sebelum menghapus.`,
        400
      );
    }

    await this.prisma.crmLeadStatusConfig.delete({
      where: { id },
    });

    return { message: "Status berhasil dihapus", id };
  }

  /**
   * Urutkan ulang tahapan status
   */
  async reorderStatuses(statusIds: string[]) {
    if (!Array.isArray(statusIds) || statusIds.length === 0) {
      throw new ApiError("Daftar statusIds tidak valid", 400);
    }

    await this.prisma.$transaction(
      statusIds.map((id, index) =>
        this.prisma.crmLeadStatusConfig.update({
          where: { id },
          data: { orderIndex: index + 1 },
        })
      )
    );

    return await this.getStatuses();
  }
}
