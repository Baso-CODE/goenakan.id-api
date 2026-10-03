import { translate } from "@vitalets/google-translate-api";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../../utils/api-error";
import { PaginationService } from "../../../../pagination/pagination.service";
import { PrismaService } from "../../../../prisma/prisma.service";
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

  private async translateText(text: string): Promise<string> {
    const value = text.trim();

    if (!value) {
      throw new ApiError("Teks tidak boleh kosong", 400);
    }

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await translate(value, {
          from: "id",
          to: "en",
        });

        if (!response.text?.trim()) {
          throw new Error("Google Translate returned empty result");
        }

        return response.text.trim();
      } catch (error) {
        console.error(`Translation attempt ${attempt} failed:`, error);

        if (attempt === maxAttempts) {
          throw new ApiError(
            "Gagal menerjemahkan teks Indonesia ke Inggris",
            502,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      }
    }

    throw new ApiError("Gagal menerjemahkan teks", 502);
  }

  async createBanner(data: CreateArticleBannerDTO) {
    const articleExists = await this.prisma.article.findUnique({
      where: {
        id: data.articleId,
      },
      select: {
        id: true,
      },
    });

    if (!articleExists) {
      throw new ApiError("Article not found", 404);
    }

    const buttonTextEn = await this.translateText(data.buttonTextId);

    try {
      const banner = await this.prisma.articleBanner.create({
        data: {
          articleId: data.articleId,
          backgroundColor: data.backgroundColor,

          buttonTextId: data.buttonTextId,
          buttonTextEn,

          ctaLink: data.ctaLink,
          isActive: data.isActive ?? false,
        },
      });

      return this.getBannerById(banner.id);
    } catch (error) {
      console.error("ERROR CREATING BANNER:", error);

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError("Database error occurred while creating banner.", 500);
    }
  }

  async updateBanner(id: string, data: UpdateArticleBannerDTO) {
    const existing = await this.prisma.articleBanner.findUnique({
      where: {
        id,
      },
    });

    if (!existing) {
      throw new ApiError("Banner not found", 404);
    }

    if (data.articleId !== undefined && data.articleId !== existing.articleId) {
      const articleExists = await this.prisma.article.findUnique({
        where: {
          id: data.articleId,
        },
        select: {
          id: true,
        },
      });

      if (!articleExists) {
        throw new ApiError("Target article not found", 404);
      }
    }

    let buttonTextEn = existing.buttonTextEn;

    if (data.buttonTextId !== undefined) {
      buttonTextEn = await this.translateText(data.buttonTextId);
    }

    try {
      const updated = await this.prisma.articleBanner.update({
        where: {
          id,
        },
        data: {
          ...(data.articleId !== undefined && {
            articleId: data.articleId,
          }),

          ...(data.backgroundColor !== undefined && {
            backgroundColor: data.backgroundColor,
          }),

          ...(data.buttonTextId !== undefined && {
            buttonTextId: data.buttonTextId,
            buttonTextEn,
          }),

          ...(data.ctaLink !== undefined && {
            ctaLink: data.ctaLink,
          }),

          ...(data.isActive !== undefined && {
            isActive: data.isActive,
          }),
        },
      });

      return this.getBannerById(updated.id);
    } catch (error) {
      console.error("ERROR UPDATING BANNER:", error);

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError("Database error occurred while updating banner.", 500);
    }
  }

  async getBannerById(id: string) {
    const banner = await this.prisma.articleBanner.findUnique({
      where: {
        id,
      },
      include: {
        article: {
          select: {
            id: true,
            title_id: true,
            title_en: true,
            coverImage: true,
            slug: true,
          },
        },
      },
    });

    if (!banner) {
      throw new ApiError("Banner not found", 404);
    }

    return banner;
  }

  async getAllBanners(
    query: {
      page?: number;
      take?: number;
      search?: string;
      isActive?: boolean | string;
    },
    lang: string = "id",
  ) {
    const page = Number(query.page || 1);

    const take = Number(query.take || 10);

    const where: any = {};

    if (query.search) {
      where.article = {
        OR: [
          {
            title_id: {
              contains: query.search,
            },
          },
          {
            title_en: {
              contains: query.search,
            },
          },
        ],
      };
    }

    if (query.isActive !== undefined) {
      where.isActive =
        typeof query.isActive === "string"
          ? query.isActive === "true"
          : query.isActive;
    }

    const [count, data] = await Promise.all([
      this.prisma.articleBanner.count({
        where,
      }),

      this.prisma.articleBanner.findMany({
        where,
        skip: (page - 1) * take,
        take,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          article: {
            select: {
              id: true,
              title_id: true,
              title_en: true,
              coverImage: true,
              slug: true,
            },
          },
        },
      }),
    ]);

    const isEn = lang === "en";

    const formattedData = data.map((banner) => {
      const buttonText =
        isEn && banner.buttonTextEn ? banner.buttonTextEn : banner.buttonTextId;

      const articleTitle =
        isEn && banner.article?.title_en
          ? banner.article.title_en
          : banner.article?.title_id;

      return {
        id: banner.id,
        articleId: banner.articleId,

        backgroundColor: banner.backgroundColor,

        buttonTextId: banner.buttonTextId,
        buttonTextEn: banner.buttonTextEn,

        buttonText,

        ctaLink: banner.ctaLink,
        isActive: banner.isActive,

        createdAt: banner.createdAt,
        updatedAt: banner.updatedAt,

        article: banner.article
          ? {
              id: banner.article.id,

              slug: banner.article.slug,

              coverImage: banner.article.coverImage,

              title_id: banner.article.title_id,

              title_en: banner.article.title_en,

              title: articleTitle,
            }
          : null,
      };
    });

    const meta = this.pagination.generateMeta({
      count,
      page,
      take,
    });

    return {
      data: formattedData,
      meta,
    };
  }

  async deleteBanner(id: string) {
    const existing = await this.prisma.articleBanner.findUnique({
      where: {
        id,
      },
    });

    if (!existing) {
      throw new ApiError("Banner not found", 404);
    }

    try {
      return await this.prisma.articleBanner.delete({
        where: {
          id,
        },
      });
    } catch (error) {
      console.error("ERROR DELETING BANNER:", error);

      throw new ApiError("Database error occurred while deleting banner.", 500);
    }
  }

  async getActiveBannersPublic(lang: string = "id") {
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
              id: true,
              title_id: true,
              title_en: true,
              coverImage: true,
              publishedAt: true,
              createdAt: true,
              slug: true,

              category: {
                select: {
                  name_id: true,
                  name_en: true,
                },
              },
            },
          },
        },
      });

      const isEn = lang === "en";

      return banners.map((banner) => {
        const buttonText =
          isEn && banner.buttonTextEn
            ? banner.buttonTextEn
            : banner.buttonTextId;

        const articleTitle =
          isEn && banner.article?.title_en
            ? banner.article.title_en
            : banner.article?.title_id;

        const categoryName =
          isEn && banner.article?.category?.name_en
            ? banner.article.category.name_en
            : banner.article?.category?.name_id;

        return {
          id: banner.id,

          backgroundColor: banner.backgroundColor,

          buttonText,

          ctaLink: banner.ctaLink,

          article: banner.article
            ? {
                id: banner.article.id,

                title: articleTitle,

                slug: banner.article.slug,

                coverImage: banner.article.coverImage,

                publishedAt: banner.article.publishedAt,

                createdAt: banner.article.createdAt,

                category: banner.article.category
                  ? {
                      name: categoryName,
                    }
                  : null,
              }
            : null,
        };
      });
    } catch (error) {
      console.error("ERROR FETCHING PUBLIC BANNERS:", error);

      throw new ApiError("Failed to fetch active banners.", 500);
    }
  }
}
