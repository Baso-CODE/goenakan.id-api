import { translate } from "@vitalets/google-translate-api";
import { injectable } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { CloudinaryService } from "../../../cloudinary/cloudinary.service";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  CreateEventCategoryDTO,
  UpdateEventCategoryDTO,
} from "./dto/event-category.dto";

@injectable()
export class EventCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly slug: SlugService,
    private readonly pagination: PaginationService,
  ) {}

  // ====================================================================
  // 1. GET ALL FOR ADMIN (With Pagination & Search)
  // ====================================================================
  async getAllEventCategories(query: {
    page?: number;
    take?: number;
    search?: string;
  }) {
    const where: any = {};
    if (query.search) {
      // Pencarian mencakup title_id atau title_en
      where.OR = [
        { title_id: { contains: query.search, mode: "insensitive" } },
        { title_en: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const count = await this.prisma.eventCategory.count({ where });
    const data = await this.prisma.eventCategory.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { displayOrder: "asc" },
    });

    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 10),
    });

    return { data, meta };
  }

  // ====================================================================
  // 2. GET BY ID
  // ====================================================================
  async getEventCategoryById(id: string) {
    const category = await this.prisma.eventCategory.findUnique({
      where: { id },
    });
    if (!category) throw new ApiError("Event Category not found", 404);
    return category;
  }

  // ====================================================================
  // CREATE EVENT CATEGORY (Dengan Auto-Translate jika EN kosong)
  // ====================================================================
  async createEventCategory(
    data: CreateEventCategoryDTO,
    file: Express.Multer.File,
  ) {
    if (!file) throw new ApiError("Event category image is required", 400);

    // Slug dibuat berdasarkan title_id utama
    const slug = this.slug.create(data.title_id);
    let uploadResult;

    // --- 1. PROSES AUTO-TRANSLATE JIKA TITLE_EN KOSONG ---
    let finalTitleEn = data.title_en;

    try {
      if (!finalTitleEn && data.title_id) {
        const resTitle = await translate(data.title_id, { to: "en" });
        finalTitleEn = resTitle.text;
      }
    } catch (transError) {
      console.warn(
        "⚠️ Warning: Auto-translate event category gagal:",
        transError,
      );
    }

    // --- 2. UPLOAD KE CLOUDINARY ---
    try {
      uploadResult = await this.cloudinary.upload(file, {
        folder: "event_categories",
      });
    } catch (error: any) {
      console.error("🔥 CLOUDINARY UPLOAD ERROR:", error);
      throw new ApiError(`Gagal upload gambar: ${error.message}`, 500);
    }

    // --- 3. INSERT KE DATABASE ---
    try {
      const newCategory = await this.prisma.eventCategory.create({
        data: {
          title_id: data.title_id,
          title_en: finalTitleEn || null, // Menggunakan hasil terjemahan otomatis atau input manual
          slug,
          orderCount:
            data.orderCount !== undefined ? Number(data.orderCount) : 0,
          displayOrder:
            data.displayOrder !== undefined ? Number(data.displayOrder) : 0,
          isActive:
            data.isActive !== undefined
              ? String(data.isActive) === "true"
              : true,

          image: uploadResult.secure_url,
          imageId: uploadResult.public_id,
        },
      });

      return newCategory;
    } catch (error: any) {
      if (uploadResult?.public_id) {
        await this.cloudinary.delete(uploadResult.public_id).catch(() => null);
      }

      console.error("🔥 DATABASE INSERT ERROR:", error);

      if (error.code === "P2002") {
        throw new ApiError(
          `Kategori event "${data.title_id}" sudah ada (Slug duplikat).`,
          400,
        );
      }

      throw new ApiError(
        "Terjadi kesalahan saat menyimpan data ke database.",
        500,
      );
    }
  }

  // ====================================================================
  // 4. UPDATE EVENT CATEGORY (Dengan Smart Auto-Translate)
  // ====================================================================
  async updateEventCategory(
    id: string,
    data: UpdateEventCategoryDTO,
    file?: Express.Multer.File,
  ) {
    const existing = await this.getEventCategoryById(id);

    let imageUrl = existing.image;
    let imageId = existing.imageId;

    // --- JIKA ADA FILE BARU ---
    if (file) {
      try {
        if (existing.imageId) {
          await this.cloudinary.delete(existing.imageId).catch(() => null);
        }

        const uploadResult = await this.cloudinary.upload(file, {
          folder: "event_categories",
        });
        imageUrl = uploadResult.secure_url;
        imageId = uploadResult.public_id;
      } catch (error: any) {
        console.error("🔥 CLOUDINARY UPDATE ERROR:", error);
        throw new ApiError(`Gagal memperbarui gambar: ${error.message}`, 500);
      }
    }

    // --- 1. PROSES SMART AUTO-TRANSLATE UNTUK UPDATE ---
    let finalTitleEn = data.title_en;

    try {
      const activeTitleId =
        data.title_id !== undefined ? data.title_id : existing.title_id;

      // Cek apakah title_id mengalami perubahan dari data lama di database
      const titleIdChanged =
        data.title_id !== undefined && data.title_id !== existing.title_id;

      // Terjemahan ulang akan dipicu jika:
      // - title_en kosong/tidak ada
      // - ATAU title_id diubah DAN title_en masih bernilai sama dengan data lama (artinya user tidak mengubah terjemahan Inggris secara manual)
      const shouldTranslate =
        !finalTitleEn ||
        (titleIdChanged &&
          (finalTitleEn === existing.title_en || !finalTitleEn));

      if (shouldTranslate && activeTitleId) {
        const resTitle = await translate(activeTitleId, { to: "en" });
        finalTitleEn = resTitle.text;
      }
    } catch (transError) {
      console.warn(
        "⚠️ Warning: Auto-translate update event category gagal:",
        transError,
      );
    }

    // --- 2. UPDATE DATABASE ---
    try {
      const slug =
        data.title_id && data.title_id !== existing.title_id
          ? this.slug.create(data.title_id)
          : existing.slug;

      const updatedCategory = await this.prisma.eventCategory.update({
        where: { id },
        data: {
          title_id:
            data.title_id !== undefined ? data.title_id : existing.title_id,
          title_en:
            finalTitleEn !== undefined ? finalTitleEn : existing.title_en,
          slug,
          orderCount:
            data.orderCount !== undefined
              ? Number(data.orderCount)
              : existing.orderCount,
          image: imageUrl,
          imageId: imageId,
          displayOrder:
            data.displayOrder !== undefined
              ? Number(data.displayOrder)
              : existing.displayOrder,
          isActive:
            data.isActive !== undefined
              ? String(data.isActive) === "true"
              : existing.isActive,
        },
      });

      return updatedCategory;
    } catch (error: any) {
      console.error("🔥 DATABASE UPDATE ERROR:", error);

      if (error.code === "P2002") {
        throw new ApiError("Kategori event tersebut sudah ada.", 400);
      }

      throw new ApiError(
        "Terjadi kesalahan saat memperbarui data di database.",
        500,
      );
    }
  }
  // ====================================================================
  // 5. DELETE EVENT CATEGORY
  // ====================================================================
  async deleteEventCategory(id: string) {
    const existing = await this.getEventCategoryById(id);

    try {
      if (existing.imageId) {
        await this.cloudinary.delete(existing.imageId);
      }

      return await this.prisma.eventCategory.delete({ where: { id } });
    } catch (error: any) {
      console.error("🔥 DELETE ERROR:", error);
      throw new ApiError("Gagal menghapus kategori event dari sistem.", 500);
    }
  }

  // ====================================================================
  // 6. GET PUBLIC EVENT CATEGORIES (Dengan dukungan parameter lang)
  // ====================================================================
  async getPublicEventCategories(lang: string = "id") {
    try {
      const categories = await this.prisma.eventCategory.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          title_id: true,
          title_en: true,
          slug: true,
          orderCount: true,
          image: true,
        },
      });

      // Mapping data untuk menyesuaikan bahasa yang diminta (lang)
      return categories.map((cat) => ({
        id: cat.id,
        title: lang === "en" && cat.title_en ? cat.title_en : cat.title_id,
        slug: cat.slug,
        orderCount: cat.orderCount,
        image: cat.image,
      }));
    } catch (error) {
      throw new ApiError("Gagal mengambil data kategori event publik.", 500);
    }
  }

  // ====================================================================
  // 7. GET PUBLIC EVENT CATEGORY BY SLUG (Dengan dukungan parameter lang)
  // ====================================================================
  async getPublicEventCategoryBySlug(slug: string, lang: string = "id") {
    try {
      const category = await this.prisma.eventCategory.findFirst({
        where: {
          slug: slug,
          isActive: true,
        },
        include: {
          portfolios: {
            where: { isActive: true },
            orderBy: { displayOrder: "asc" },
            select: {
              id: true,
              title_id: true,
              title_en: true,
              slug: true,
              clientName: true,
              image: true,
              orderQuantity: true,
              projectDate: true,
            },
          },
        },
      });

      if (!category) {
        throw new ApiError("Kategori event tidak ditemukan.", 404);
      }

      // Mapping hasil kategori utama
      const translatedCategory = {
        ...category,
        title:
          lang === "en" && category.title_en
            ? category.title_en
            : category.title_id,
        // Mapping juga portofolio di dalamnya agar sesuai dengan bahasa
        portfolios: category.portfolios.map((p) => ({
          ...p,
          title: lang === "en" && p.title_en ? p.title_en : p.title_id,
        })),
      };

      return translatedCategory;
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      throw new ApiError("Gagal mengambil detail kategori event.", 500);
    }
  }

  // ====================================================================
  // GET EVENT CATEGORY LIST (Untuk Dropdown dengan dukungan lang)
  // ====================================================================
  async getEventCategoryList(lang: string = "id") {
    try {
      const categories = await this.prisma.eventCategory.findMany({
        where: { isActive: true },
        select: {
          id: true,
          title_id: true,
          title_en: true,
        },
        orderBy: { title_id: "asc" },
      });

      return categories.map((cat) => ({
        id: cat.id,
        title: lang === "en" && cat.title_en ? cat.title_en : cat.title_id,
      }));
    } catch (error) {
      throw new ApiError("Gagal mengambil daftar kategori event.", 500);
    }
  }
}
