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

  // === CREATE ===
  async create(data: CreateSuccessStoryDTO) {
    // ⏱️ Stopwatch 1: Mulai hitung total waktu dari awal fungsi dipanggil
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

    // ⏱️ Stopwatch 2: Mulai hitung waktu khusus saat menyentuh Database
    console.time("💾 DB_EXECUTION_TIME");

    // 3. Simpan langsung ke Prisma
    const result = await this.prisma.successStory.create({
      data: {
        slug: generatedSlug,
        titleId: data.titleId,
        titleEn: data.titleEn,
        sideContentHtmlId: data.sideContentHtmlId,
        sideContentHtmlEn: data.sideContentHtmlEn,
        mainContentHtmlId: data.mainContentHtmlId,
        mainContentHtmlEn: data.mainContentHtmlEn,
        client: {
          connect: {
            id: data.clientId,
          },
        },
        heroImageUrl: data.heroImageUrl,
        heroImagePublicId: heroPublicId,
        media1Url: data.media1Url || null,
        media1PublicId: media1PublicId,
        media2Url: data.media2Url || null,
        media2PublicId: media2PublicId,
      },
    });

    // 🏁 Selesai hitung waktu database
    console.timeEnd("💾 DB_EXECUTION_TIME");

    // 🏁 Selesai hitung total waktu fungsi
    console.timeEnd("⏱️ TOTAL_CREATE_DURATION");

    return result;
  }
  // === UPDATE ===
  async update(
    id: string,
    data: UpdateSuccessStoryDTO,
    files: SuccessStoryFiles,
  ) {
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

    // ✨ Jika Admin mengirimkan titleId baru, buat slug baru. Jika tidak, gunakan slug lama.
    let updatedSlug = existing.slug;
    if (data.titleId && data.titleId !== existing.titleId) {
      updatedSlug = this.slugService.create(data.titleId);
    }

    const safeRemove = async (url: string | null) => {
      if (url)
        try {
          await this.cloudinary.remove(url);
        } catch (e) {
          console.error("Error delete:", e);
        }
    };

    if (files.heroImage) {
      await safeRemove(existing.heroImageUrl);
      const res = await this.cloudinary.upload(files.heroImage, {
        folder: "success-stories",
        resource_type: "image",
      });
      heroImageUrl = res.secure_url;
      heroImagePublicId = res.public_id;
    }
    if (files.media1) {
      await safeRemove(existing.media1Url);
      const res = await this.cloudinary.upload(files.media1, {
        folder: "success-stories",
        resource_type: "auto",
      });
      media1Url = res.secure_url;
      media1PublicId = res.public_id;
    }
    if (files.media2) {
      await safeRemove(existing.media2Url);
      const res = await this.cloudinary.upload(files.media2, {
        folder: "success-stories",
        resource_type: "auto",
      });
      media2Url = res.secure_url;
      media2PublicId = res.public_id;
    }

    return await this.prisma.successStory.update({
      where: { id },
      data: {
        ...data,
        slug: updatedSlug, // ✨ Perbarui slug (jika titleId berubah)
        heroImageUrl,
        heroImagePublicId,
        media1Url,
        media1PublicId,
        media2Url,
        media2PublicId,
      },
    });
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
