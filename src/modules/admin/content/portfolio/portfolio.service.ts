import { injectable } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { translateWithDeepL } from "../../../../utils/deepl-translate";
import { SlugService } from "../../../../utils/genereateSlug";
import { CloudinaryService } from "../../../cloudinary/cloudinary.service";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreatePortfolioDTO } from "./dto/createPorfolio.dto";
import { UpdatePortfolioDTO } from "./dto/updatePorfolio.dto";

@injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly slug: SlugService,
    private readonly pagination: PaginationService,
  ) {}

  // ====================================================================
  // 1. GET ALL FOR ADMIN (With Pagination & Search)
  // ====================================================================
  async getAllPortfolios(query: {
    page?: number;
    take?: number;
    search?: string;
  }) {
    const where: any = {};
    if (query.search) {
      where.OR = [
        { title_id: { contains: query.search, mode: "insensitive" } },
        { title_en: { contains: query.search, mode: "insensitive" } },
        { clientName: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const count = await this.prisma.portfolio.count({ where });
    const data = await this.prisma.portfolio.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { displayOrder: "asc" },
      include: {
        eventCategory: {
          select: {
            id: true,
            title_id: true,
            title_en: true,
          },
        },
      },
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
  async getPortfolioById(id: string) {
    const portfolio = await this.prisma.portfolio.findUnique({ where: { id } });
    if (!portfolio) throw new ApiError("Portfolio not found", 404);
    return portfolio;
  }

  // ====================================================================
  // 3. CREATE PORTFOLIO - DEEPL AUTO TRANSLATION
  // ====================================================================
  async createPortfolio(data: CreatePortfolioDTO, file: Express.Multer.File) {
    if (!file) {
      throw new ApiError("Portfolio image is required", 400);
    }

    const slug = this.slug.create(data.title_id);

    // =====================================================
    // 1. DEEPL TRANSLATION
    // =====================================================

    let finalTitleEn = data.title_en?.trim() || null;
    let finalDescEn = data.description_en?.trim() || null;

    // Translate title jika EN belum diisi
    if (!finalTitleEn && data.title_id?.trim()) {
      try {
        finalTitleEn = await translateWithDeepL(data.title_id.trim());
      } catch (error) {
        console.error("❌ DeepL portfolio title translation failed:", error);
      }
    }

    // Translate description jika EN belum diisi
    if (!finalDescEn && data.description?.trim()) {
      try {
        finalDescEn = await translateWithDeepL(data.description.trim());
      } catch (error) {
        console.error(
          "❌ DeepL portfolio description translation failed:",
          error,
        );
      }
    }

    // =====================================================
    // 2. CLOUDINARY UPLOAD
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
        folder: "portfolios",
      });
    } catch (error) {
      console.error("🔥 CLOUDINARY UPLOAD ERROR:", error);

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(
        "Gagal mengunggah gambar portfolio ke Cloudinary.",
        500,
      );
    }

    // =====================================================
    // 3. DATABASE INSERT
    // =====================================================

    try {
      const newPortfolio = await this.prisma.portfolio.create({
        data: {
          title_id: data.title_id,
          title_en: finalTitleEn,
          slug,

          clientName: data.clientName,

          description: data.description || null,
          description_en: finalDescEn,

          image: uploadResult.secure_url,
          imageId: uploadResult.public_id,

          displayOrder: Number(data.displayOrder ?? 0),

          isActive:
            data.isActive !== undefined
              ? String(data.isActive) === "true"
              : true,

          orderQuantity:
            data.orderQuantity !== undefined ? Number(data.orderQuantity) : 0,

          projectDate: data.projectDate ? new Date(data.projectDate) : null,

          eventCategoryId: data.eventCategoryId || null,
        },
      });

      return newPortfolio;
    } catch (error: any) {
      // Jika database gagal, bersihkan gambar baru.
      try {
        await this.cloudinary.delete(uploadResult.public_id);
      } catch (cleanupError) {
        console.warn("⚠️ Failed to cleanup portfolio image:", cleanupError);
      }

      console.error("🔥 DATABASE INSERT ERROR:", error);

      if (error.code === "P2002") {
        throw new ApiError(
          `Judul portfolio "${data.title_id}" sudah digunakan (Slug duplikat).`,
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
  // 4. UPDATE PORTFOLIO - SMART DEEPL AUTO TRANSLATION
  // ====================================================================
  async updatePortfolio(
    id: string,
    data: UpdatePortfolioDTO,
    file?: Express.Multer.File,
  ) {
    const existing = await this.getPortfolioById(id);

    // =====================================================
    // 1. PREPARE CURRENT DATA
    // =====================================================

    const activeTitleId = (data.title_id ?? existing.title_id ?? "").trim();

    if (!activeTitleId) {
      throw new ApiError("Judul portfolio tidak boleh kosong", 400);
    }

    const activeDescription =
      data.description !== undefined ? data.description : existing.description;

    const titleIdChanged =
      data.title_id !== undefined &&
      activeTitleId !== (existing.title_id ?? "").trim();

    const descriptionChanged =
      data.description !== undefined &&
      data.description !== existing.description;

    let finalTitleEn = existing.title_en;
    let finalDescEn = existing.description_en;

    // =====================================================
    // 2. SMART DEEPL TRANSLATION - TITLE
    // =====================================================

    const providedTitleEn = data.title_en?.trim();

    const titleManualChanged =
      providedTitleEn !== undefined &&
      providedTitleEn.length > 0 &&
      providedTitleEn !== existing.title_en;

    if (titleManualChanged) {
      // Prioritaskan input bahasa Inggris manual.
      finalTitleEn = providedTitleEn;
    } else {
      const shouldTranslateTitle =
        titleIdChanged ||
        (data.title_en !== undefined && !providedTitleEn) ||
        !existing.title_en?.trim();

      // Validasi langsung sebelum pemanggilan DeepL.
      if (shouldTranslateTitle && activeTitleId?.trim()) {
        try {
          finalTitleEn = await translateWithDeepL(activeTitleId.trim());
        } catch (error) {
          console.error("❌ DeepL portfolio title translation failed:", error);

          // Pertahankan terjemahan sebelumnya.
          finalTitleEn = existing.title_en;
        }
      }
    }

    // DESCRIPTION
    const providedDescEn = data.description_en?.trim();

    const descriptionManualChanged =
      providedDescEn !== undefined &&
      providedDescEn.length > 0 &&
      providedDescEn !== existing.description_en;

    if (descriptionManualChanged) {
      finalDescEn = providedDescEn;
    } else {
      const shouldTranslateDescription =
        Boolean(activeDescription?.trim()) &&
        (descriptionChanged ||
          (data.description_en !== undefined && !providedDescEn) ||
          !existing.description_en?.trim());

      if (shouldTranslateDescription && activeDescription) {
        try {
          finalDescEn = await translateWithDeepL(activeDescription.trim());
        } catch (error) {
          console.error(
            "❌ DeepL portfolio description translation failed:",
            error,
          );

          finalDescEn = existing.description_en;
        }
      }
    }

    // =====================================================
    // 3. CLOUDINARY UPLOAD
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

        // Upload gambar baru terlebih dahulu.
        const uploadResult = await this.cloudinary.upload(file, {
          folder: "portfolios",
        });

        imageUrl = uploadResult.secure_url;
        imageId = uploadResult.public_id;

        newImagePublicId = uploadResult.public_id;
      } catch (error) {
        console.error("🔥 CLOUDINARY UPDATE ERROR:", error);

        if (error instanceof ApiError) {
          throw error;
        }

        throw new ApiError("Gagal memperbarui gambar portfolio.", 500);
      }
    }

    // =====================================================
    // 4. UPDATE DATABASE
    // =====================================================

    try {
      const slug = titleIdChanged
        ? this.slug.create(activeTitleId)
        : existing.slug;

      const updatedPortfolio = await this.prisma.portfolio.update({
        where: { id },
        data: {
          title_id: activeTitleId,
          title_en: finalTitleEn,
          slug,

          clientName:
            data.clientName !== undefined
              ? data.clientName
              : existing.clientName,

          description: activeDescription,
          description_en: finalDescEn,

          image: imageUrl,
          imageId,

          displayOrder:
            data.displayOrder !== undefined
              ? Number(data.displayOrder)
              : existing.displayOrder,

          isActive:
            data.isActive !== undefined
              ? String(data.isActive) === "true"
              : existing.isActive,

          orderQuantity:
            data.orderQuantity !== undefined
              ? Number(data.orderQuantity)
              : existing.orderQuantity,

          projectDate:
            data.projectDate !== undefined
              ? data.projectDate
                ? new Date(data.projectDate)
                : null
              : existing.projectDate,

          eventCategoryId:
            data.eventCategoryId !== undefined
              ? data.eventCategoryId || null
              : existing.eventCategoryId,
        },
      });

      // =====================================================
      // 5. CLEANUP OLD IMAGE AFTER DATABASE SUCCESS
      // =====================================================

      if (
        newImagePublicId &&
        existing.imageId &&
        existing.imageId !== newImagePublicId
      ) {
        try {
          await this.cloudinary.delete(existing.imageId);
        } catch (error) {
          // Database sudah berhasil diperbarui.
          // Jangan gagalkan update hanya karena cleanup gagal.
          console.warn("⚠️ Failed to delete old portfolio image:", error);
        }
      }

      return updatedPortfolio;
    } catch (error: any) {
      // =====================================================
      // 6. ROLLBACK NEW IMAGE ON DATABASE FAILURE
      // =====================================================

      if (newImagePublicId) {
        try {
          await this.cloudinary.delete(newImagePublicId);
        } catch (cleanupError) {
          console.warn(
            "⚠️ Failed to cleanup new portfolio image:",
            cleanupError,
          );
        }
      }

      console.error("🔥 DATABASE UPDATE ERROR:", error);

      if (error.code === "P2002") {
        throw new ApiError("Judul portfolio tersebut sudah digunakan.", 400);
      }

      throw new ApiError(
        "Terjadi kesalahan saat memperbarui data di database.",
        500,
      );
    }
  }

  // ====================================================================
  // 5. DELETE PORTFOLIO
  // ====================================================================
  async deletePortfolio(id: string) {
    const existing = await this.getPortfolioById(id);

    try {
      if (existing.imageId) {
        await this.cloudinary.delete(existing.imageId);
      }

      return await this.prisma.portfolio.delete({ where: { id } });
    } catch (error: any) {
      console.error("🔥 DELETE ERROR:", error);
      throw new ApiError("Gagal menghapus portfolio dari sistem.", 500);
    }
  }

  // ====================================================================
  // 6. GET PUBLIC PORTFOLIOS (Dengan dukungan parameter lang)
  // ====================================================================
  async getPublicPortfolios(lang: string = "id") {
    try {
      const portfolios = await this.prisma.portfolio.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          title_id: true,
          title_en: true,
          clientName: true,
          image: true,
          slug: true,
          description: true,
          description_en: true,
        },
      });

      // Mapping hasil data agar properti 'title' dan 'description' menyesuaikan bahasa
      return portfolios.map((item) => ({
        id: item.id,
        title: lang === "en" && item.title_en ? item.title_en : item.title_id,
        description:
          lang === "en" && item.description_en
            ? item.description_en
            : item.description,
        clientName: item.clientName,
        image: item.image,
        slug: item.slug,
      }));
    } catch (error) {
      throw new ApiError("Gagal mengambil data portfolio publik.", 500);
    }
  }

  // ====================================================================
  // 7. GET PORTFOLIO LIST PUBLIC (Untuk Halaman Search & Pagination)
  // ====================================================================
  async getPortfolioListPublic(query: {
    page?: number;
    take?: number;
    search?: string;
    locale?: string;
  }) {
    const where: any = {
      isActive: true, // Hanya tampilkan portofolio yang aktif
    };

    // ✨ Logika Pencarian: Cari di judul Indonesia, judul Inggris, atau nama klien
    if (query.search) {
      where.OR = [
        { title_id: { contains: query.search } },
        { title_en: { contains: query.search } },
        { clientName: { contains: query.search } },
      ];
    }

    // Hitung total data untuk keperluan pagination (Tombol Load More)
    const count = await this.prisma.portfolio.count({ where });

    // Ambil data berdasarkan halaman (page) dan batasan (take)
    const data = await this.prisma.portfolio.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 6),
      take: Number(query.take || 6),
      orderBy: { displayOrder: "asc" }, // Urutkan sesuai aturan urutan display
      select: {
        id: true,
        title_id: true,
        title_en: true,
        clientName: true,
        image: true,
        slug: true,
        description: true,
        description_en: true,
      },
    });

    // Mapping hasil data agar properti 'title' menyesuaikan bahasa (locale)
    const mappedData = data.map((item) => ({
      id: item.id,
      title:
        query.locale === "en" && item.title_en ? item.title_en : item.title_id,
      description:
        query.locale === "en" && item.description_en
          ? item.description_en
          : item.description,
      clientName: item.clientName,
      image: item.image,
      slug: item.slug,
    }));

    // Buat data meta (informasi halaman)
    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 6),
    });

    return { data: mappedData, meta };
  }
}
