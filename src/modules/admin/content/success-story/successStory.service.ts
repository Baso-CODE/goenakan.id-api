import { injectable } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { translateWithDeepL } from "../../../../utils/deepl-translate";
import { SlugService } from "../../../../utils/genereateSlug"; // ✨ Pastikan path ini sesuai
import { CloudinaryService } from "../../../cloudinary/cloudinary.service";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  CreateSuccessStoryDTO,
  UpdateSuccessStoryDTO,
} from "./dto/successStory.dto";

export interface SuccessStoryFiles {
  heroImage?: Express.Multer.File;
  media1?: Express.Multer.File;
  media2?: Express.Multer.File;
}

@injectable()
export class SuccessStoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly pagination: PaginationService,
    private readonly slugService: SlugService,
  ) {}

  /**
   * Translate plain text Indonesia ke Inggris menggunakan DeepL.
   * Digunakan untuk judul Success Story.
   */
  private async translateText(
    text: string | null | undefined,
  ): Promise<string | null> {
    if (text == null || !text.trim()) {
      return null;
    }

    try {
      const translated = await translateWithDeepL(text.trim());

      if (!translated?.trim()) {
        throw new Error("DeepL returned an empty translation");
      }

      return translated.trim();
    } catch (error) {
      console.error("❌ DeepL text translation failed:", error);

      throw new ApiError(
        "Gagal menerjemahkan teks Indonesia ke Inggris menggunakan DeepL",
        502,
      );
    }
  }

  /**
   * Translate konten HTML Indonesia ke Inggris menggunakan DeepL.
   * Struktur HTML diproses melalui tag_handling="html".
   */
  private async translateHtml(
    html: string | null | undefined,
  ): Promise<string | null> {
    if (html == null || !html.trim()) {
      return null;
    }

    try {
      const translated = await translateWithDeepL(html, true);

      if (!translated?.trim()) {
        throw new Error("DeepL returned an empty HTML translation");
      }

      return translated;
    } catch (error) {
      console.error("❌ DeepL HTML translation failed:", error);

      throw new ApiError(
        "Gagal menerjemahkan konten HTML menggunakan DeepL",
        502,
      );
    }
  }
  // === GET ALL PUBLIC (Pagination 9 Item & Locale & Client Name) ===
  async getAllPublic(locale: string = "id", page: number = 1) {
    const take = 9;
    const skip = (page - 1) * take;

    const [stories, totalItems] = await Promise.all([
      this.prisma.successStory.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          client: { include: { b2b: true, b2c: true } },
        },
      }),
      this.prisma.successStory.count(),
    ]);

    const formattedData = stories.map((story) => {
      const isEn = locale === "en";
      let clientName = "-";
      if (story.client?.b2b) clientName = story.client.b2b.companyName;
      else if (story.client?.b2c) clientName = story.client.b2c.name;

      return {
        id: story.id,
        slug: story.slug,
        clientId: story.clientId,
        clientName: clientName,
        title: isEn && story.titleEn ? story.titleEn : story.titleId,
        heroImageUrl: story.heroImageUrl,
        createdAt: story.createdAt,
      };
    });

    return {
      data: formattedData,
      meta: {
        page,
        take,
        total: totalItems,
        hasNext: skip + stories.length < totalItems,
      },
    };
  }

  // ====================================================================
  // CREATE SUCCESS STORY - DEEPL TRANSLATION
  // ====================================================================
  async create(data: CreateSuccessStoryDTO) {
    // =====================================================
    // 1. VALIDATION
    // =====================================================

    if (!data.heroImageUrl?.trim()) {
      throw new ApiError("Hero Image URL is required", 400);
    }

    const generatedSlug = this.slugService.create(data.titleId);

    // =====================================================
    // 2. EXTRACT CLOUDINARY PUBLIC IDs
    // =====================================================

    const heroPublicId = this.cloudinary.extractPublicIdFromUrl(
      data.heroImageUrl,
    );

    const media1PublicId = data.media1Url
      ? this.cloudinary.extractPublicIdFromUrl(data.media1Url)
      : null;

    const media2PublicId = data.media2Url
      ? this.cloudinary.extractPublicIdFromUrl(data.media2Url)
      : null;

    // =====================================================
    // 3. DEEPL TRANSLATION
    // =====================================================

    // Ketiga permintaan dijalankan secara paralel.
    // Jika salah satu gagal, create dibatalkan
    // agar konten bilingual tidak tersimpan sebagian.

    const [titleEn, sideContentHtmlEn, mainContentHtmlEn] = await Promise.all([
      this.translateText(data.titleId),
      this.translateHtml(data.sideContentHtmlId),
      this.translateHtml(data.mainContentHtmlId),
    ]);

    // =====================================================
    // 4. CREATE DATABASE RECORD
    // =====================================================

    try {
      const result = await this.prisma.successStory.create({
        data: {
          slug: generatedSlug,

          // Indonesian & English Title
          titleId: data.titleId,
          titleEn,

          // Side Content
          sideContentHtmlId: data.sideContentHtmlId,
          sideContentHtmlEn,

          // Main Content
          mainContentHtmlId: data.mainContentHtmlId,
          mainContentHtmlEn,

          // Client Relation
          client: {
            connect: {
              id: data.clientId,
            },
          },

          // Hero Image
          heroImageUrl: data.heroImageUrl,
          heroImagePublicId: heroPublicId,

          // Additional Media
          media1Url: data.media1Url || null,
          media1PublicId,

          media2Url: data.media2Url || null,
          media2PublicId,
        },
      });

      return result;
    } catch (error: any) {
      console.error("🔥 ERROR CREATING SUCCESS STORY:", error);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error.code === "P2002") {
        throw new ApiError(
          "Success Story dengan slug tersebut sudah tersedia",
          400,
        );
      }

      throw new ApiError(
        "Database error occurred while creating Success Story",
        500,
      );
    }
  }
  // ====================================================================
  // UPDATE SUCCESS STORY - SMART DEEPL TRANSLATION
  // ====================================================================
  async update(id: string, data: UpdateSuccessStoryDTO) {
    // =====================================================
    // 1. GET EXISTING DATA
    // =====================================================

    const existing = await this.prisma.successStory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Success Story not found", 404);
    }

    // =====================================================
    // 2. PREPARE MEDIA
    // =====================================================

    let {
      heroImageUrl,
      heroImagePublicId,
      media1Url,
      media1PublicId,
      media2Url,
      media2PublicId,
    } = existing;

    const oldPublicIdsToDelete = new Set<string>();

    // =====================================================
    // 3. UPDATE SLUG
    // =====================================================

    let updatedSlug = existing.slug;

    const titleChanged =
      data.titleId !== undefined && data.titleId !== existing.titleId;

    if (titleChanged && data.titleId) {
      updatedSlug = this.slugService.create(data.titleId);
    }

    // =====================================================
    // 4. PREPARE HERO IMAGE
    // =====================================================

    if (data.heroImageUrl !== undefined) {
      if (!data.heroImageUrl?.trim()) {
        throw new ApiError("Hero Image URL cannot be empty", 400);
      }

      if (data.heroImageUrl !== existing.heroImageUrl) {
        if (existing.heroImagePublicId) {
          oldPublicIdsToDelete.add(existing.heroImagePublicId);
        }

        heroImageUrl = data.heroImageUrl;

        heroImagePublicId = this.cloudinary.extractPublicIdFromUrl(
          data.heroImageUrl,
        );
      }
    }

    // =====================================================
    // 5. PREPARE MEDIA 1
    // =====================================================

    if (data.media1Url !== undefined && data.media1Url !== existing.media1Url) {
      if (existing.media1PublicId) {
        oldPublicIdsToDelete.add(existing.media1PublicId);
      }

      media1Url = data.media1Url;

      media1PublicId = data.media1Url
        ? this.cloudinary.extractPublicIdFromUrl(data.media1Url)
        : null;
    }

    // =====================================================
    // 6. PREPARE MEDIA 2
    // =====================================================

    if (data.media2Url !== undefined && data.media2Url !== existing.media2Url) {
      if (existing.media2PublicId) {
        oldPublicIdsToDelete.add(existing.media2PublicId);
      }

      media2Url = data.media2Url;

      media2PublicId = data.media2Url
        ? this.cloudinary.extractPublicIdFromUrl(data.media2Url)
        : null;
    }

    // =====================================================
    // 7. SMART DEEPL TRANSLATION
    // =====================================================

    let titleEn = existing.titleEn;
    let sideContentHtmlEn = existing.sideContentHtmlEn;
    let mainContentHtmlEn = existing.mainContentHtmlEn;

    const sideContentChanged =
      data.sideContentHtmlId !== undefined &&
      data.sideContentHtmlId !== existing.sideContentHtmlId;

    const mainContentChanged =
      data.mainContentHtmlId !== undefined &&
      data.mainContentHtmlId !== existing.mainContentHtmlId;

    // Translate hanya field yang berubah.
    // Jika konten Indonesia dikosongkan, EN ikut kosong.

    const [translatedTitle, translatedSideContent, translatedMainContent] =
      await Promise.all([
        titleChanged
          ? this.translateText(data.titleId)
          : Promise.resolve(titleEn),

        sideContentChanged
          ? this.translateHtml(data.sideContentHtmlId)
          : Promise.resolve(sideContentHtmlEn),

        mainContentChanged
          ? this.translateHtml(data.mainContentHtmlId)
          : Promise.resolve(mainContentHtmlEn),
      ]);

    titleEn = translatedTitle;
    sideContentHtmlEn = translatedSideContent;
    mainContentHtmlEn = translatedMainContent;

    // =====================================================
    // 8. UPDATE DATABASE
    // =====================================================

    let updated;

    try {
      updated = await this.prisma.successStory.update({
        where: { id },

        data: {
          // Title + Slug
          ...(data.titleId !== undefined && {
            titleId: data.titleId,
            titleEn,
            slug: updatedSlug,
          }),

          // Client
          ...(data.clientId !== undefined && {
            clientId: data.clientId,
          }),

          // Side Content
          ...(data.sideContentHtmlId !== undefined && {
            sideContentHtmlId: data.sideContentHtmlId,
            sideContentHtmlEn,
          }),

          // Main Content
          ...(data.mainContentHtmlId !== undefined && {
            mainContentHtmlId: data.mainContentHtmlId,
            mainContentHtmlEn,
          }),

          // Hero Image
          heroImageUrl,
          heroImagePublicId,

          // Additional Media
          media1Url,
          media1PublicId,

          media2Url,
          media2PublicId,
        },
      });
    } catch (error: any) {
      console.error("🔥 ERROR UPDATING SUCCESS STORY:", error);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error.code === "P2002") {
        throw new ApiError("Slug Success Story sudah digunakan", 400);
      }

      throw new ApiError(
        "Database error occurred while updating Success Story",
        500,
      );
    }

    // =====================================================
    // 9. DELETE UNUSED OLD CLOUDINARY MEDIA
    // =====================================================

    // Jangan hapus public ID yang masih digunakan oleh
    // salah satu field media pada record yang diperbarui.

    const currentPublicIds = new Set(
      [heroImagePublicId, media1PublicId, media2PublicId].filter(
        (value): value is string => Boolean(value),
      ),
    );

    const unusedOldPublicIds = [...oldPublicIdsToDelete].filter(
      (publicId) => !currentPublicIds.has(publicId),
    );

    await Promise.allSettled(
      unusedOldPublicIds.map(async (publicId) => {
        try {
          await this.cloudinary.remove(publicId);
        } catch (error) {
          console.warn(
            `⚠️ Failed to remove old Success Story media (${publicId}):`,
            error,
          );
        }
      }),
    );

    // =====================================================
    // 10. RETURN UPDATED RECORD
    // =====================================================

    return updated;
  }
  // === GET BY CLIENT PUBLIC ===
  async getByClientPublic(
    clientId: string,
    locale: string = "id",
    page: number = 1,
  ) {
    const take = 9;
    const skip = (page - 1) * take;

    const [stories, totalItems] = await Promise.all([
      this.prisma.successStory.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          client: { include: { b2b: true, b2c: true } },
        },
      }),
      this.prisma.successStory.count({ where: { clientId } }),
    ]);

    const formattedData = stories.map((story) => {
      const isEn = locale === "en";
      let clientName = "-";
      if (story.client?.b2b) clientName = story.client.b2b.companyName;
      else if (story.client?.b2c) clientName = story.client.b2c.name;

      return {
        id: story.id,
        slug: story.slug,
        clientId: story.clientId,
        clientName: clientName,
        title: isEn && story.titleEn ? story.titleEn : story.titleId,
        heroImageUrl: story.heroImageUrl,
        createdAt: story.createdAt,
      };
    });

    return {
      data: formattedData,
      meta: {
        page,
        take,
        total: totalItems,
        hasNext: skip + stories.length < totalItems,
      },
    };
  }

  // === GET DETAIL BY SLUG PUBLIC ===
  async getBySlugPublic(slug: string, locale: string = "id") {
    const story = await this.prisma.successStory.findUnique({
      where: { slug },
      include: {
        client: { include: { b2b: true, b2c: true } },
      },
    });

    if (!story) throw new ApiError("Cerita tidak ditemukan", 404);

    const isEn = locale === "en";
    let clientName = "-";
    if (story.client?.b2b) clientName = story.client.b2b.companyName;
    else if (story.client?.b2c) clientName = story.client.b2c.name;

    return {
      data: {
        id: story.id,
        slug: story.slug,
        clientId: story.clientId,
        clientName: clientName,
        title: isEn && story.titleEn ? story.titleEn : story.titleId,
        sideContentHtml:
          isEn && story.sideContentHtmlEn
            ? story.sideContentHtmlEn
            : story.sideContentHtmlId,
        mainContentHtml:
          isEn && story.mainContentHtmlEn
            ? story.mainContentHtmlEn
            : story.mainContentHtmlId,
        heroImageUrl: story.heroImageUrl,
        media1Url: story.media1Url,
        media2Url: story.media2Url,
        createdAt: story.createdAt,
      },
    };
  }

  // === GET ALL ADMIN ===
  async getAllAdmin(query: { page?: number; take?: number; search?: string }) {
    const page = Number(query.page) || 1;
    const take = Number(query.take) || 10;
    const skip = (page - 1) * take;

    const where: any = {};
    if (query.search) {
      where.OR = [
        { titleId: { contains: query.search } },
        {
          client: { b2b: { is: { companyName: { contains: query.search } } } },
        },
        { client: { b2c: { is: { name: { contains: query.search } } } } },
      ];
    }

    const count = await this.prisma.successStory.count({ where });
    const data = await this.prisma.successStory.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          include: {
            b2b: { select: { companyName: true } },
            b2c: { select: { name: true } },
          },
        },
      },
    });

    const formattedData = data.map((story) => {
      let clientName = "-";
      if (story.client?.b2b) clientName = story.client.b2b.companyName;
      else if (story.client?.b2c) clientName = story.client.b2c.name;
      return { ...story, clientName };
    });

    const meta = this.pagination.generateMeta({ count, page, take });
    return { data: formattedData, meta };
  }

  // === GET BY ID ===
  async getById(id: string) {
    const story = await this.prisma.successStory.findUnique({
      where: { id },
      include: { client: { include: { b2b: true, b2c: true } } },
    });
    if (!story) throw new ApiError("Success Story not found", 404);
    return story;
  }

  // === DELETE ===
  async delete(id: string) {
    const existing = await this.prisma.successStory.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Success Story not found", 404);

    const safeRemove = async (url: string | null) => {
      if (url)
        try {
          await this.cloudinary.remove(url);
        } catch (e) {
          console.error("Error delete:", e);
        }
    };

    await safeRemove(existing.heroImageUrl);
    await safeRemove(existing.media1Url);
    await safeRemove(existing.media2Url);

    return await this.prisma.successStory.delete({ where: { id } });
  }
}
