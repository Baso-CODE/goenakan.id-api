import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  CreateArticleBannerDTO,
  UpdateArticleBannerDTO,
} from "../dto/articleBanner.dto";

@injectable()
export class ArticleBannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  // =========================================================================
  // 1. CREATE BANNER
  // =========================================================================
  async createBanner(data: CreateArticleBannerDTO) {
    // Pastikan artikel yang dipilih benar-benar ada
    const articleExists = await this.prisma.article.findUnique({
      where: { id: data.articleId },
    });

    if (!articleExists) {
      throw new ApiError("Article not found", 404);
    }

    try {
      const banner = await this.prisma.articleBanner.create({
        data: {
          articleId: data.articleId,
          backgroundColor: data.backgroundColor,
          buttonText: data.buttonText,
          ctaLink: data.ctaLink,
          isActive: data.isActive ?? false,
        },
      });

      return this.getBannerById(banner.id);
    } catch (error) {
      console.error("🔥 ERROR CREATING BANNER:", error);
      throw new ApiError("Database error occurred while creating banner.", 500);
    }
  }

  // =========================================================================
  // 2. UPDATE BANNER
  // =========================================================================
  async updateBanner(id: string, data: UpdateArticleBannerDTO) {
    const existing = await this.prisma.articleBanner.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Banner not found", 404);
    }

    // Jika ganti articleId, pastikan artikel baru tersebut ada
    if (data.articleId && data.articleId !== existing.articleId) {
      const articleExists = await this.prisma.article.findUnique({
        where: { id: data.articleId },
      });
      if (!articleExists) throw new ApiError("Target article not found", 404);
    }

    try {
      const updated = await this.prisma.articleBanner.update({
        where: { id },
        data: {
          articleId: data.articleId,
          backgroundColor: data.backgroundColor,
          buttonText: data.buttonText,
          ctaLink: data.ctaLink,
          isActive: data.isActive,
        },
      });

      return this.getBannerById(updated.id);
    } catch (error) {
      console.error("🔥 ERROR UPDATING BANNER:", error);
      throw new ApiError("Database error occurred while updating banner.", 500);
    }
  }

  // =========================================================================
  // 3. GET BANNER BY ID (Untuk Form Edit di Admin)
  // =========================================================================
  async getBannerById(id: string) {
    const banner = await this.prisma.articleBanner.findUnique({
      where: { id },
      include: {
        article: {
          select: {
            id: true,
            title_id: true, // Sesuaikan dengan model baru
            title_en: true, // Anda mungkin juga butuh ini di frontend
            coverImage: true,
          },
        },
      },
    });

    if (!banner) throw new ApiError("Banner not found", 404);

    // Opsional: Jika ingin tetap mempertahankan properti 'title' untuk kemudahan frontend
    return {
      ...banner,
      article: banner.article
        ? {
            ...banner.article,
            title: banner.article.title_id, // Memetakan kembali ke 'title' agar frontend tidak rusak
          }
        : null,
    };
  }
  async getAllBanners(query: {
    page?: number;
    take?: number;
    search?: string;
    isActive?: boolean | string;
  }) {
    const where: any = {};

    // Perbaikan: Mencari berdasarkan title_id
    if (query.search) {
      where.article = {
        title_id: { contains: query.search },
      };
    }

    if (query.isActive !== undefined) {
      if (typeof query.isActive === "string") {
        where.isActive = query.isActive === "true";
      } else {
        where.isActive = query.isActive;
      }
    }

    const count = await this.prisma.articleBanner.count({ where });

    const data = await this.prisma.articleBanner.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { createdAt: "desc" },
      include: {
        article: {
          // Perbaikan: Select title_id (dan opsional title_en)
          select: {
            title_id: true,
            title_en: true,
            coverImage: true,
            slug: true,
          },
        },
      },
    });

    // Melakukan mapping data agar tetap kompatibel dengan frontend yang mengharapkan 'title'
    const formattedData = data.map((banner) => ({
      ...banner,
      article: banner.article
        ? {
            ...banner.article,
            title: banner.article.title_id, // Frontend tetap menerima 'title'
          }
        : null,
    }));

    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 10),
    });

    return { data: formattedData, meta };
  }
  // =========================================================================
  // 5. DELETE BANNER
  // =========================================================================
  async deleteBanner(id: string) {
    const existing = await this.prisma.articleBanner.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Banner not found", 404);

    try {
      const deleted = await this.prisma.articleBanner.delete({
        where: { id },
      });
      return deleted;
    } catch (error) {
      console.error("🔥 ERROR DELETING BANNER:", error);
      throw new ApiError("Database error occurred while deleting banner.", 500);
    }
  }

  // =========================================================================
  // 6. GET ACTIVE BANNERS (KHUSUS UNTUK CLIENT PUBLIK / CAROUSEL)
  // =========================================================================
  async getActiveBannersPublic() {
    try {
      const banners = await this.prisma.articleBanner.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          article: {
            select: {
              title_id: true, // Update: Ambil title_id
              title_en: true, // Update: Ambil title_en untuk kebutuhan frontend
              coverImage: true,
              publishedAt: true,
              createdAt: true,
              slug: true,
              category: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      // Mapping agar struktur data tetap kompatibel dengan frontend
      // Frontend biasanya mengakses banner.article.title
      return banners.map((banner) => ({
        ...banner,
        article: banner.article
          ? {
              ...banner.article,
              title: banner.article.title_id, // Tetap sediakan 'title' untuk UI
            }
          : null,
      }));
    } catch (error) {
      console.error("🔥 ERROR FETCHING PUBLIC BANNERS:", error);
      throw new ApiError("Failed to fetch active banners.", 500);
    }
  }
}
