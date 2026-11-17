import { injectable, singleton } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateCrmTemplateDTO } from "./dto/createCrmTemplate.dto";
import { UpdateCrmTemplateDTO } from "./dto/updateCrmTemplate.dto";

const DEFAULT_TEMPLATES = [
  {
    title: "Salam & Sambutan",
    content: "Halo Kak! Terima kasih telah menghubungi Goenakan.id. Ada yang bisa kami bantu untuk kebutuhan seragam atau merchandise custom Anda?",
    category: "Salam",
    shortcut: "/salam",
    orderIndex: 1,
  },
  {
    title: "Format Pemesanan Custom",
    content: "Untuk estimasi harga dan konsultasi desain, mohon dibantu informasi berikut ya Kak:\n1. Jenis Produk (Kaos/Polo/Kemeja/Jaket/Merch):\n2. Jumlah Qty (Pcs):\n3. Target Deadline Acara:\n4. Apakah sudah ada file logo/desain?",
    category: "Pemesanan",
    shortcut: "/format",
    orderIndex: 2,
  },
  {
    title: "Katalog & Pricelist",
    content: "Halo Kak, katalog pilihan bahan dan portofolio produk Goenakan.id dapat dilihat di tautan berikut: https://goenakan.id/catalog. Jika ada model yang disukai, silakan kirimkan referensinya ke sini ya!",
    category: "Katalog",
    shortcut: "/katalog",
    orderIndex: 3,
  },
  {
    title: "Rekening Pembayaran Resmi",
    content: "Berikut rekening pembayaran resmi Goenakan.id:\nBank BCA: 123-456-7890\na/n PT Goenakan Kreasi Nusantara\n\nMohon mengirimkan bukti transfer setelah pembayaran dilakukan ya Kak. Terima kasih! 🙏",
    category: "Pembayaran",
    shortcut: "/rekening",
    orderIndex: 4,
  },
  {
    title: "Follow Up Penawaran",
    content: "Halo Kak, menindaklanjuti penawaran harga kami kemarin, apakah ada hal atau spesifikasi yang ingin didiskusikan lebih lanjut?",
    category: "Follow Up",
    shortcut: "/followup",
    orderIndex: 5,
  },
];

@singleton()
@injectable()
export class CrmTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mengambil semua template pesan cepat (Quick Reply)
   */
  async getTemplates() {
    let items = await this.prisma.crmMessageTemplate.findMany({
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    });

    // Auto-seed default jika tabel masih kosong
    if (items.length === 0) {
      for (const def of DEFAULT_TEMPLATES) {
        await this.prisma.crmMessageTemplate.create({
          data: def,
        });
      }
      items = await this.prisma.crmMessageTemplate.findMany({
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      });
    }

    return items;
  }

  /**
   * Membuat template pesan baru
   */
  async createTemplate(dto: CreateCrmTemplateDTO) {
    const trimmedTitle = dto.title.trim();
    const trimmedContent = dto.content.trim();

    if (!trimmedTitle) {
      throw new ApiError("Judul template tidak boleh kosong", 400);
    }
    if (!trimmedContent) {
      throw new ApiError("Isi template pesan tidak boleh kosong", 400);
    }

    const maxOrder = await this.prisma.crmMessageTemplate.aggregate({
      _max: { orderIndex: true },
    });
    const nextOrder = (maxOrder._max.orderIndex || 0) + 1;

    let formattedShortcut = dto.shortcut?.trim() || null;
    if (formattedShortcut && !formattedShortcut.startsWith("/")) {
      formattedShortcut = `/${formattedShortcut}`;
    }

    return this.prisma.crmMessageTemplate.create({
      data: {
        title: trimmedTitle,
        content: trimmedContent,
        category: dto.category?.trim() || "Umum",
        shortcut: formattedShortcut,
        orderIndex: nextOrder,
      },
    });
  }

  /**
   * Memperbarui template pesan
   */
  async updateTemplate(id: string, dto: UpdateCrmTemplateDTO) {
    const existing = await this.prisma.crmMessageTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Template pesan tidak ditemukan", 404);
    }

    const dataToUpdate: any = {};

    if (dto.title !== undefined) {
      const trimmedTitle = dto.title.trim();
      if (!trimmedTitle) {
        throw new ApiError("Judul template tidak boleh kosong", 400);
      }
      dataToUpdate.title = trimmedTitle;
    }

    if (dto.content !== undefined) {
      const trimmedContent = dto.content.trim();
      if (!trimmedContent) {
        throw new ApiError("Isi template pesan tidak boleh kosong", 400);
      }
      dataToUpdate.content = trimmedContent;
    }

    if (dto.category !== undefined) {
      dataToUpdate.category = dto.category.trim() || "Umum";
    }

    if (dto.shortcut !== undefined) {
      let formattedShortcut = dto.shortcut?.trim() || null;
      if (formattedShortcut && !formattedShortcut.startsWith("/")) {
        formattedShortcut = `/${formattedShortcut}`;
      }
      dataToUpdate.shortcut = formattedShortcut;
    }

    return this.prisma.crmMessageTemplate.update({
      where: { id },
      data: dataToUpdate,
    });
  }

  /**
   * Menghapus template pesan
   */
  async deleteTemplate(id: string) {
    const existing = await this.prisma.crmMessageTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Template pesan tidak ditemukan", 404);
    }

    await this.prisma.crmMessageTemplate.delete({
      where: { id },
    });

    return {
      success: true,
      message: `Template "${existing.title}" berhasil dihapus`,
    };
  }

  /**
   * Mengambil semua kategori template pesan beserta jumlah penggunaannya
   */
  async getCategories() {
    let items = await this.prisma.crmTemplateCategory.findMany({
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    });

    if (items.length === 0) {
      const defaultCategories = ["Salam", "Pemesanan", "Katalog", "Pembayaran", "Follow Up", "Komplain", "Umum"];
      for (let i = 0; i < defaultCategories.length; i++) {
        await this.prisma.crmTemplateCategory.upsert({
          where: { name: defaultCategories[i] },
          update: {},
          create: { name: defaultCategories[i], orderIndex: i + 1 },
        });
      }
      items = await this.prisma.crmTemplateCategory.findMany({
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      });
    }

    const templates = await this.prisma.crmMessageTemplate.findMany({
      select: { category: true },
    });

    const counts: Record<string, number> = {};
    for (const t of templates) {
      const cat = t.category || "Umum";
      counts[cat.toLowerCase()] = (counts[cat.toLowerCase()] || 0) + 1;
    }

    return items.map((cat) => ({
      ...cat,
      templateCount: counts[cat.name.toLowerCase()] || 0,
    }));
  }

  /**
   * Membuat kategori template pesan baru
   */
  async createCategory(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ApiError("Nama kategori tidak boleh kosong", 400);
    }

    const existing = await this.prisma.crmTemplateCategory.findFirst({
      where: { name: trimmed },
    });
    if (existing) {
      throw new ApiError(`Kategori "${trimmed}" sudah ada`, 409);
    }

    const maxOrder = await this.prisma.crmTemplateCategory.aggregate({
      _max: { orderIndex: true },
    });
    const nextOrder = (maxOrder._max.orderIndex || 0) + 1;

    return this.prisma.crmTemplateCategory.create({
      data: {
        name: trimmed,
        orderIndex: nextOrder,
      },
    });
  }

  /**
   * Memperbarui kategori template pesan (juga sinkron ke template terkait)
   */
  async updateCategory(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ApiError("Nama kategori tidak boleh kosong", 400);
    }

    const existing = await this.prisma.crmTemplateCategory.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new ApiError("Kategori tidak ditemukan", 404);
    }

    if (trimmed.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await this.prisma.crmTemplateCategory.findFirst({
        where: { name: trimmed, id: { not: id } },
      });
      if (duplicate) {
        throw new ApiError(`Kategori "${trimmed}" sudah ada`, 409);
      }

      // Update template yang menggunakan nama kategori lama
      await this.prisma.crmMessageTemplate.updateMany({
        where: { category: existing.name },
        data: { category: trimmed },
      });
    }

    return this.prisma.crmTemplateCategory.update({
      where: { id },
      data: { name: trimmed },
    });
  }

  /**
   * Menghapus kategori template pesan
   */
  async deleteCategory(id: string) {
    const existing = await this.prisma.crmTemplateCategory.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new ApiError("Kategori tidak ditemukan", 404);
    }

    // Pindahkan template terkait ke "Umum"
    await this.prisma.crmMessageTemplate.updateMany({
      where: { category: existing.name },
      data: { category: "Umum" },
    });

    await this.prisma.crmTemplateCategory.delete({
      where: { id },
    });

    return {
      success: true,
      message: `Kategori "${existing.name}" berhasil dihapus`,
    };
  }
}
