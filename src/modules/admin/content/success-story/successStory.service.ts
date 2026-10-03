import { translate } from "@vitalets/google-translate-api";
import { injectable } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
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

  private async translateText(
    text: string | null | undefined,
  ): Promise<string | null> {
    if (text === null || text === undefined) {
      return null;
    }

    const value = text.trim();

    if (!value) {
      return null;
    }

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`🌐 Translating ID → EN (${attempt}/${maxAttempts})`);

        const response = await translate(value, {
          from: "id",
          to: "en",
        });

        if (!response.text?.trim()) {
          throw new Error("Google Translate returned empty result");
        }

        return response.text;
      } catch (error) {
        console.error(`❌ Translation attempt ${attempt} failed:`, error);

        if (attempt === maxAttempts) {
          throw new ApiError(
            "Gagal menerjemahkan konten Indonesia ke Inggris",
            502,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      }
    }

    return null;
  }

  private async translateHtml(
    html: string | null | undefined,
  ): Promise<string | null> {
    if (html === null || html === undefined) {
      return null;
    }

    if (!html.trim()) {
      return null;
    }

    const parts = html.split(/(<[^>]+>)/g);

    const translatedParts: string[] = [];

    for (const part of parts) {
      if (!part) {
        continue;
      }

      if (part.startsWith("<") && part.endsWith(">")) {
        translatedParts.push(part);
        continue;
      }

      if (!part.trim() || part.trim() === "&nbsp;") {
        translatedParts.push(part);
        continue;
      }

      const translated = await this.translateText(part);

      translatedParts.push(translated ?? part);
    }

    return translatedParts.join("");
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
  // === CREATE ===
  // ====================================================================
  async create(data: CreateSuccessStoryDTO) {
    console.time("⏱️ TOTAL_CREATE_DURATION");

    // 1. Validasi URL Hero Image
    if (!data.heroImageUrl) {
      throw new ApiError("Hero Image URL is required", 400);
    }

    const generatedSlug = this.slugService.create(data.titleId);

    // 2. Ekstrak Public ID dari URL yang dikirim frontend
    const heroPublicId = this.cloudinary.extractPublicIdFromUrl(
      data.heroImageUrl,
    );
    const media1PublicId = data.media1Url
      ? this.cloudinary.extractPublicIdFromUrl(data.media1Url)
      : null;
    const media2PublicId = data.media2Url
      ? this.cloudinary.extractPublicIdFromUrl(data.media2Url)
      : null;

    const titleEn = await this.translateText(data.titleId);
    const sideContentHtmlEn = await this.translateHtml(data.sideContentHtmlId);
    const mainContentHtmlEn = await this.translateHtml(data.mainContentHtmlId);

    const result = await this.prisma.successStory.create({
      data: {
        slug: generatedSlug,

        titleId: data.titleId,
        titleEn,

        sideContentHtmlId: data.sideContentHtmlId,
        sideContentHtmlEn,

        mainContentHtmlId: data.mainContentHtmlId,
        mainContentHtmlEn,

        client: {
          connect: {
            id: data.clientId,
          },
        },

        heroImageUrl: data.heroImageUrl,
        heroImagePublicId: heroPublicId,

        media1Url: data.media1Url || null,
        media1PublicId,

        media2Url: data.media2Url || null,
        media2PublicId,
      },
    });

    console.timeEnd("💾 DB_EXECUTION_TIME");
    console.timeEnd("⏱️ TOTAL_CREATE_DURATION");

    return result;
  }

  // ====================================================================
  // === UPDATE ===
  // ====================================================================

  async update(id: string, data: UpdateSuccessStoryDTO) {
    const existing = await this.prisma.successStory.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Success Story not found", 404);

    let {
      heroImageUrl,
      heroImagePublicId,
      media1Url,
      media1PublicId,
      media2Url,
      media2PublicId,
    } = existing;

    // 1. Perbarui Slug jika judul berubah
    let updatedSlug = existing.slug;
    if (data.titleId && data.titleId !== existing.titleId) {
      updatedSlug = this.slugService.create(data.titleId);
    }

    // Helper untuk menghapus file lama di Cloudinary berdasarkan Public ID
    const safeRemove = async (publicId: string | null) => {
      if (publicId) {
        try {
          await this.cloudinary.remove(publicId);
        } catch (e) {
          console.error(
            `Gagal menghapus file lama (${publicId}) di Cloudinary:`,
            e,
          );
        }
      }
    };

    // Jika frontend mengirim URL Hero baru yang berbeda dengan yang ada di database
    if (data.heroImageUrl && data.heroImageUrl !== existing.heroImageUrl) {
      await safeRemove(existing.heroImagePublicId); // Hapus file lama di cloud
      heroImageUrl = data.heroImageUrl; // Simpan URL baru
      heroImagePublicId = this.cloudinary.extractPublicIdFromUrl(
        data.heroImageUrl,
      );
    }

    // Lakukan hal yang sama untuk Media 1
    if (data.media1Url !== undefined && data.media1Url !== existing.media1Url) {
      await safeRemove(existing.media1PublicId);
      media1Url = data.media1Url;
      media1PublicId = data.media1Url
        ? this.cloudinary.extractPublicIdFromUrl(data.media1Url)
        : null;
    }

    // Lakukan hal yang sama untuk Media 2
    if (data.media2Url !== undefined && data.media2Url !== existing.media2Url) {
      await safeRemove(existing.media2PublicId);
      media2Url = data.media2Url;
      media2PublicId = data.media2Url
        ? this.cloudinary.extractPublicIdFromUrl(data.media2Url)
        : null;
    }

    let titleEn = existing.titleEn;

    let sideContentHtmlEn = existing.sideContentHtmlEn;

    let mainContentHtmlEn = existing.mainContentHtmlEn;

    if (data.titleId !== undefined) {
      titleEn = await this.translateText(data.titleId);
    }

    if (data.sideContentHtmlId !== undefined) {
      sideContentHtmlEn = await this.translateHtml(data.sideContentHtmlId);
    }

    if (data.mainContentHtmlId !== undefined) {
      mainContentHtmlEn = await this.translateHtml(data.mainContentHtmlId);
    }

    // 4. Update data ke database
    return this.prisma.successStory.update({
      where: {
        id,
      },
      data: {
        ...(data.titleId !== undefined && {
          titleId: data.titleId,
          titleEn,
          slug: updatedSlug,
        }),

        ...(data.clientId !== undefined && {
          clientId: data.clientId,
        }),

        ...(data.sideContentHtmlId !== undefined && {
          sideContentHtmlId: data.sideContentHtmlId,
          sideContentHtmlEn,
        }),

        ...(data.mainContentHtmlId !== undefined && {
          mainContentHtmlId: data.mainContentHtmlId,
          mainContentHtmlEn,
        }),

        heroImageUrl,
        heroImagePublicId,

        media1Url,
        media1PublicId,

        media2Url,
        media2PublicId,
      },
    });
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
