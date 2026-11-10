import { injectable } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { translateWithDeepL } from "../../../../utils/deepl-translate";
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
  // CREATE EVENT CATEGORY - DEEPL AUTO TRANSLATE
  // ====================================================================
  async createEventCategory(
    data: CreateEventCategoryDTO,
    file: Express.Multer.File,
  ) {
    // =====================================================
    // 1. VALIDATION & SLUG
    // =====================================================

    if (!file) {
      throw new ApiError("Event category image is required", 400);
    }

    const slug = this.slug.create(data.title_id);

    // =====================================================
    // 2. AUTO TRANSLATE USING DEEPL
    // =====================================================

    let finalTitleEn: string | null = data.title_en?.trim() || null;

    // Input manual EN selalu diprioritaskan.
    // DeepL hanya dipanggil jika EN kosong.
    if (!finalTitleEn && data.title_id?.trim()) {
      try {
        const translated = await translateWithDeepL(data.title_id.trim());

        finalTitleEn = translated?.trim() || null;
      } catch (error) {
        console.warn(
          "⚠️ DeepL create event category translation failed:",
          error,
        );
      }
    }

    // =====================================================
    // 3. UPLOAD IMAGE TO CLOUDINARY
    // =====================================================

    let uploadResult: {
      secure_url: string;
      public_id: string;
    };

    try {
      if (!file.buffer) {
        throw new ApiError(
          "File buffer kosong. Pastikan Multer menggunakan memoryStorage().",
          400,
        );
      }

      uploadResult = await this.cloudinary.upload(file, {
        folder: "event_categories",
      });
    } catch (error) {
      console.error("🔥 CLOUDINARY UPLOAD ERROR:", error);

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError("Gagal mengunggah gambar kategori event.", 500);
    }

    // =====================================================
    // 4. CREATE DATABASE RECORD
    // =====================================================

    try {
      const newCategory = await this.prisma.eventCategory.create({
        data: {
          title_id: data.title_id,
          title_en: finalTitleEn,
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
      // Jika database gagal, hapus gambar yang baru
      // diunggah agar tidak menjadi orphan file.
      try {
        await this.cloudinary.delete(uploadResult.public_id);
      } catch (cleanupError) {
        console.warn(
          "⚠️ Failed to cleanup event category image:",
          cleanupError,
        );
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
  // UPDATE EVENT CATEGORY - SMART DEEPL AUTO TRANSLATE
  // ====================================================================
  async updateEventCategory(
    id: string,
    data: UpdateEventCategoryDTO,
    file?: Express.Multer.File,
  ) {
    // =====================================================
    // 1. GET EXISTING CATEGORY
    // =====================================================

    const existing = await this.getEventCategoryById(id);

    if (!existing) {
      throw new ApiError("Event category not found", 404);
    }

    // =====================================================
    // 2. PREPARE TITLE & SLUG
    // =====================================================

    // =====================================================
    // 2. PREPARE TITLE & SLUG
    // =====================================================

    const activeTitleId = (data.title_id ?? existing.title_id ?? "").trim();

    // Pastikan title_id tidak kosong
    if (!activeTitleId) {
      throw new ApiError("Judul kategori event tidak boleh kosong", 400);
    }

    const titleIdChanged =
      data.title_id !== undefined && activeTitleId !== existing.title_id;

    const slug = titleIdChanged
      ? this.slug.create(activeTitleId)
      : existing.slug;
    // =====================================================
    // 3. SMART DEEPL AUTO TRANSLATION
    // =====================================================

    let finalTitleEn: string | null = existing.title_en ?? null;

    const existingEnglishTitle = existing.title_en?.trim() || "";

    const providedEnglishTitle = data.title_en?.trim();

    // Jika admin mengirim teks Inggris baru yang
    // berbeda dari database, prioritaskan nilai manual.
    const englishTitleManuallyChanged =
      providedEnglishTitle !== undefined &&
      providedEnglishTitle.length > 0 &&
      providedEnglishTitle !== existingEnglishTitle;

    if (englishTitleManuallyChanged) {
      finalTitleEn = providedEnglishTitle;
    } else {
      // Terjemahkan apabila:
      // 1. Judul Indonesia berubah
      // 2. Field Inggris sengaja dikosongkan
      // 3. Nilai Inggris belum tersedia dan judul
      //    Indonesia dikirim untuk diperbarui
      const shouldTranslate =
        Boolean(activeTitleId?.trim()) &&
        (titleIdChanged ||
          (data.title_en !== undefined && !providedEnglishTitle) ||
          (data.title_id !== undefined && !existingEnglishTitle));

      if (shouldTranslate) {
        try {
          const translated = await translateWithDeepL(activeTitleId.trim());

          if (translated?.trim()) {
            finalTitleEn = translated.trim();
          }
        } catch (error) {
          console.warn(
            "⚠️ DeepL update event category translation failed:",
            error,
          );

          // Pertahankan nilai Inggris lama.
          finalTitleEn = existing.title_en ?? null;
        }
      }
    }

    // =====================================================
    // 4. PREPARE IMAGE
    // =====================================================

    let imageUrl = existing.image;
    let imageId = existing.imageId;

    let newImagePublicId: string | null = null;

    if (file) {
      try {
        if (!file.buffer) {
          throw new ApiError(
            "File buffer kosong. Pastikan Multer menggunakan memoryStorage().",
            400,
          );
        }

        // Jangan hapus gambar lama dahulu.
        const uploadResult = await this.cloudinary.upload(file, {
          folder: "event_categories",
        });

        imageUrl = uploadResult.secure_url;
        imageId = uploadResult.public_id;
        newImagePublicId = uploadResult.public_id;
      } catch (error) {
        console.error("🔥 CLOUDINARY UPDATE ERROR:", error);

        if (error instanceof ApiError) {
          throw error;
        }

        throw new ApiError("Gagal memperbarui gambar kategori event.", 500);
      }
    }

    // =====================================================
    // 5. UPDATE DATABASE
    // =====================================================

    let updatedCategory;

    try {
      updatedCategory = await this.prisma.eventCategory.update({
        where: { id },
        data: {
          title_id: activeTitleId,
          title_en: finalTitleEn,
          slug,

          orderCount:
            data.orderCount !== undefined
              ? Number(data.orderCount)
              : existing.orderCount,

          displayOrder:
            data.displayOrder !== undefined
              ? Number(data.displayOrder)
              : existing.displayOrder,

          isActive:
            data.isActive !== undefined
              ? String(data.isActive) === "true"
              : existing.isActive,

          image: imageUrl,
          imageId,
        },
      });
    } catch (error: any) {
      console.error("🔥 DATABASE UPDATE ERROR:", error);

      // Database gagal, bersihkan gambar baru.
      // Gambar lama tetap dipertahankan.
      if (newImagePublicId) {
        try {
          await this.cloudinary.delete(newImagePublicId);
        } catch (cleanupError) {
          console.warn(
            "⚠️ Failed to cleanup new event category image:",
            cleanupError,
          );
        }
      }

      if (error.code === "P2002") {
        throw new ApiError("Kategori event tersebut sudah ada.", 400);
      }

      throw new ApiError(
        "Terjadi kesalahan saat memperbarui data di database.",
        500,
      );
    }

    // =====================================================
    // 6. DELETE OLD IMAGE AFTER DATABASE SUCCESS
    // =====================================================

    if (
      newImagePublicId &&
      existing.imageId &&
      existing.imageId !== newImagePublicId
    ) {
      try {
        await this.cloudinary.delete(existing.imageId);
      } catch (error) {
        // Cleanup gambar lama tidak boleh membatalkan
        // update database yang sudah berhasil.
        console.warn("⚠️ Failed to delete old event category image:", error);
      }
    }

    return updatedCategory;
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
