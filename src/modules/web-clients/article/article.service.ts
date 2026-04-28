import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { SlugService } from "../../../utils/genereateSlug";
import { CloudinaryService } from "../../cloudinary/cloudinary.service";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateArticleDTO, UpdateArticleDTO } from "./dto/article.dto";

@injectable()
export class ArticleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // =========================================================================
  // 1. ENDPOINT KHUSUS UNTUK TIPTAP (SINGLE IMAGE UPLOAD)
  // Fungsi ini dipanggil secara asynchronous oleh frontend saat user insert gambar di Tiptap
  // =========================================================================
  async uploadTiptapImage(file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) {
      throw new ApiError("No image file provided for Tiptap upload", 400);
    }

    try {
      const uploadResult = await this.cloudinary.upload(file, {
        folder: "articles/content",
        resource_type: "image",
      });

      return { url: uploadResult.secure_url };
    } catch (error) {
      console.error("🔥 ERROR UPLOADING TIPTAP IMAGE:", error);
      throw new ApiError("Failed to upload image to Cloudinary", 500);
    }
  }

  // =========================================================================
  // 2. CREATE ARTICLE (DENGAN UPLOAD COVER IMAGE & TAGS)
  // =========================================================================
  async createArticle(
    data: CreateArticleDTO,
    authorId: string,
    coverFile?: Express.Multer.File,
  ) {
    const slug = this.slug.create(data.title);

    const existing = await this.prisma.article.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ApiError("Article with this title/slug already exists", 400);
    }

    let coverImageUrl = data.coverImage;
    let coverImagePublicId = data.coverImageId;

    if (coverFile) {
      try {
        const uploadResult = await this.cloudinary.upload(coverFile, {
          folder: "articles/covers",
          resource_type: "image",
        });
        coverImageUrl = uploadResult.secure_url;
        coverImagePublicId = uploadResult.public_id;
      } catch (error) {
        throw new ApiError("Failed to upload cover image to Cloudinary", 500);
      }
    }

    if (!coverImageUrl) {
      throw new ApiError("Cover image is required", 400);
    }

    try {
      const newArticle = await this.prisma.$transaction(async (tx) => {
        // 1. Create Article
        const article = await tx.article.create({
          data: {
            title: data.title,
            slug,
            content: data.content,
            coverImage: coverImageUrl,
            coverImageId: coverImagePublicId,
            coverImageAlt: data.coverImageAlt,
            source: data.source,
            published: data.published ?? false,
            publishedAt: data.published
              ? data.publishedAt
                ? new Date(data.publishedAt)
                : new Date()
              : null,
            categoryId: data.categoryId,
            authorId: authorId,
          },
        });

        // 2. Insert Related Products (Sticky Sidebar)
        if (data.productIds && data.productIds.length > 0) {
          await tx.articleProduct.createMany({
            data: data.productIds.map((productId) => ({
              articleId: article.id,
              productId: productId,
            })),
            skipDuplicates: true,
          });
        }

        // ✨ 3. INSERT ARTICLE TAGS (Tabel Pivot Baru)
        if (data.tagIds && data.tagIds.length > 0) {
          await tx.articleTagMap.createMany({
            data: data.tagIds.map((tagId) => ({
              articleId: article.id,
              tagId: tagId,
            })),
            skipDuplicates: true,
          });
        }

        return article;
      });

      // Mengambil data lengkap (termasuk relasi tag) untuk response
      return this.getArticleById(newArticle.id);
    } catch (error) {
      console.error("🔥 ERROR CREATING ARTICLE:", error);
      throw new ApiError(
        "Database error occurred while creating article.",
        500,
      );
    }
  }

  // =========================================================================
  // 3. UPDATE ARTICLE (DENGAN OPSI UPDATE COVER IMAGE & TAGS)
  // =========================================================================
  async updateArticle(
    id: string,
    data: UpdateArticleDTO,
    coverFile?: Express.Multer.File,
  ) {
    const existing = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Article not found", 404);

    // ✨ 1. Destructure tagIds dari data
    const { productIds, tagIds, ...articleData } = data;

    const slug = data.title ? this.slug.create(data.title) : existing.slug;

    if (data.title && data.title !== existing.title) {
      const duplicate = await this.prisma.article.findFirst({
        where: { slug, id: { not: id } },
      });

      if (duplicate) {
        throw new ApiError("Article with this title/slug already exists", 400);
      }
    }

    // --- PROSES UPDATE COVER IMAGE KE CLOUDINARY ---
    let coverImageUrl = existing.coverImage;
    let coverImagePublicId = existing.coverImageId;

    if (coverFile) {
      try {
        if (existing.coverImageId) {
          await this.cloudinary.delete(existing.coverImageId);
        }

        const uploadResult = await this.cloudinary.upload(coverFile, {
          folder: "articles/covers",
          resource_type: "image",
        });
        coverImageUrl = uploadResult.secure_url;
        coverImagePublicId = uploadResult.public_id;
      } catch (error) {
        throw new ApiError(
          "Failed to upload new cover image to Cloudinary",
          500,
        );
      }
    }

    const updateData: any = {
      ...articleData,
      slug,
      coverImage: coverImageUrl,
      coverImageId: coverImagePublicId,
    };

    if (data.published !== undefined) {
      if (
        data.published === true &&
        !existing.publishedAt &&
        !data.publishedAt
      ) {
        updateData.publishedAt = new Date();
      } else if (data.published === false) {
      } else if (data.publishedAt) {
        updateData.publishedAt = new Date(data.publishedAt);
      }
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // 1. Update data dasar artikel
        const article = await tx.article.update({
          where: { id },
          data: updateData,
        });

        // 2. Sync Related Products
        if (productIds !== undefined) {
          await tx.articleProduct.deleteMany({
            where: { articleId: id },
          });

          if (productIds.length > 0) {
            await tx.articleProduct.createMany({
              data: productIds.map((productId) => ({
                articleId: id,
                productId: productId,
              })),
            });
          }
        }

        if (tagIds !== undefined) {
          await tx.articleTagMap.deleteMany({
            where: { articleId: id },
          });

          if (tagIds.length > 0) {
            await tx.articleTagMap.createMany({
              data: tagIds.map((tagId) => ({
                articleId: id,
                tagId: tagId,
              })),
            });
          }
        }

        return article;
      });

      return this.getArticleById(updated.id);
    } catch (error) {
      console.error("🔥 ERROR UPDATING ARTICLE:", error);
      throw new ApiError(
        "Database error occurred while updating article.",
        500,
      );
    }
  }

  // === GET RELEVANT ARTICLES (BERDASARKAN KATEGORI) ===
  async getRelevantArticles(
    categoryId: string,
    currentArticleId: string,
    take: number = 6,
  ) {
    try {
      const articles = await this.prisma.article.findMany({
        where: {
          categoryId: categoryId,
          published: true,
          id: { not: currentArticleId },
        },
        take: take,
        orderBy: {
          createdAt: "desc", // Ambil yang terbaru di kategori tersebut
        },
        include: {
          category: { select: { name: true } },
        },
      });

      return articles;
    } catch (error) {
      console.error("🔥 ERROR FETCHING RELEVANT ARTICLES:", error);
      throw new ApiError("Failed to fetch relevant articles", 500);
    }
  }

  // =========================================================================
  // BACA DATA (GET BY ID, GET BY SLUG, GET ALL) & DELETE - TETAP SAMA
  // =========================================================================
  async getArticleById(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        category: true,
        author: {
          select: { id: true, name: true, email: true },
        },
        relatedProducts: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                basePrice: true,
                images: {
                  where: { isFeatured: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!article) throw new ApiError("Article not found", 404);
    return article;
  }

  async getArticleBySlug(slug: string) {
    const article = await this.prisma.article.findUnique({
      where: { slug },
      include: {
        category: true,
        author: {
          select: { name: true },
        },
        relatedProducts: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                basePrice: true,
                images: {
                  where: { isFeatured: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!article || !article.published) {
      throw new ApiError("Article not found or not published", 404);
    }
    const relevantArticles = await this.getRelevantArticles(
      article.categoryId,
      article.id,
    );
    const prevArticle = await this.prisma.article.findFirst({
      where: {
        published: true,
        createdAt: { lt: article.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { title: true, slug: true },
    });

    const nextArticle = await this.prisma.article.findFirst({
      where: {
        published: true,
        createdAt: { gt: article.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: { title: true, slug: true },
    });

    // 4. Return artikel utama beserta prev dan next-nya
    return {
      ...article,
      relevantArticles,
      prevArticle: prevArticle
        ? { title: prevArticle.title, href: `/article/${prevArticle.slug}` }
        : null,
      nextArticle: nextArticle
        ? { title: nextArticle.title, href: `/article/${nextArticle.slug}` }
        : null,
    };
  }

  async getAllArticles(query: {
    page?: number;
    take?: number;
    search?: string;
    categoryId?: string;
    published?: boolean | string;
  }) {
    const where: any = {};

    if (query.search) {
      where.title = { contains: query.search };
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.published !== undefined) {
      if (typeof query.published === "string") {
        where.published = query.published === "true";
      } else {
        where.published = query.published;
      }
    }

    const count = await this.prisma.article.count({ where });
    const data = await this.prisma.article.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { createdAt: "desc" },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        author: { select: { name: true } },
      },
    });

    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 10),
    });

    return { data, meta };
  }

  async deleteArticle(id: string) {
    const existing = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Article not found", 404);

    if (existing.coverImageId) {
      try {
        await this.cloudinary.delete(existing.coverImageId);
      } catch (error) {
        console.warn(
          `Failed to delete image ${existing.coverImageId} from Cloudinary`,
        );
      }
    }

    const deleted = await this.prisma.article.delete({
      where: { id },
    });

    return deleted;
  }

  // === GET ALL ARTICLES (PUBLIC CLIENT) ===
  async getArticleListPublic(query: {
    page?: number;
    take?: number;
    search?: string;
    categoryName?: string;
    sort?: "newest" | "older";
  }) {
    const where: any = {
      published: true,
    };

    if (query.search) {
      where.title = { contains: query.search, mode: "insensitive" };
    }

    if (query.categoryName && query.categoryName !== "All posts") {
      where.category = {
        name: query.categoryName,
      };
    }

    const count = await this.prisma.article.count({ where });

    // Logika Sorting
    const orderBy: any = {};
    if (query.sort === "older") {
      orderBy.publishedAt = "asc";
    } else {
      orderBy.publishedAt = "desc"; // Default "newest"
    }

    const data = await this.prisma.article.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 6),
      take: Number(query.take || 6),
      orderBy: orderBy,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        author: { select: { name: true } },
      },
    });

    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 6),
    });

    return { data, meta };
  }
}
