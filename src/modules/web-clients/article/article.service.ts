import { translate } from "@vitalets/google-translate-api";
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
  // 2. CREATE ARTICLE (DENGAN UPLOAD COVER IMAGE, MOBILE IMAGE & TAGS)
  // =========================================================================

  async createArticle(
    data: CreateArticleDTO,
    authorId: string,
    coverFile?: Express.Multer.File,
    coverMobileFile?: Express.Multer.File,
  ) {
    const slug = this.slug.create(data.title);

    const existing = await this.prisma.article.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ApiError("Article with this title/slug already exists", 400);
    }

    let title_en = data.title_en;
    let content_en = data.content_en;
    let focusKeywords_en = data.focusKeywords_en;

    if (data.autoTranslate) {
      try {
        if (!title_en) {
          const resTitle = await translate(data.title, { to: "en" });
          title_en = resTitle.text;
        }

        if (!content_en) {
          const resContent = await translate(data.content, { to: "en" });
          content_en = resContent.text;
        }

        if (data.focusKeywords_id && !focusKeywords_en) {
          const resFocusKeywords = await translate(data.focusKeywords_id, {
            to: "en",
          });
          focusKeywords_en = resFocusKeywords.text;
        }
      } catch (err) {
        console.error("Auto-translate failed:", err);
      }
    }

    const hasTranslation = !!(title_en && content_en);

    // =========================================================================
    // 5. HANDLE DESKTOP COVER IMAGE
    // =========================================================================
    let coverImageUrl = data.coverImage;
    let coverImagePublicId = data.coverImageId;

    if (coverImagePublicId === "null" || coverImagePublicId === "undefined") {
      coverImagePublicId = null;
    }

    if (coverFile) {
      // Karena ini fungsi Create (Buat Baru), kita tidak perlu menghapus gambar lama
      try {
        // Pastikan Multer menyertakan buffer
        if (!coverFile.buffer) {
          throw new Error(
            "File buffer kosong. Pastikan config Multer menggunakan memoryStorage().",
          );
        }

        const uploadResult = await this.cloudinary.upload(coverFile, {
          folder: "articles/covers",
          resource_type: "image",
        });

        coverImageUrl = uploadResult.secure_url;
        coverImagePublicId = uploadResult.public_id;
      } catch (error: any) {
        console.error(
          "🔥 ERROR UPLOAD CLOUDINARY (DESKTOP):",
          error.message || error,
        );
        throw new ApiError(
          "Failed to upload new cover image to Cloudinary",
          500,
        );
      }
    }

    if (!coverImageUrl) {
      throw new ApiError("Cover image desktop is required", 400);
    }

    // =========================================================================
    // 6. HANDLE MOBILE COVER IMAGE
    // =========================================================================
    let coverImageMobileUrl = data.coverImageMobile;
    let coverImageMobilePublicId = data.coverImageMobileId;

    if (
      coverImageMobilePublicId === "null" ||
      coverImageMobilePublicId === "undefined"
    ) {
      coverImageMobilePublicId = null;
    }

    if (coverMobileFile) {
      try {
        if (!coverMobileFile.buffer) {
          throw new Error("File buffer kosong.");
        }

        const uploadResultMobile = await this.cloudinary.upload(
          coverMobileFile,
          {
            folder: "articles/covers/mobile",
            resource_type: "image",
          },
        );

        coverImageMobileUrl = uploadResultMobile.secure_url;
        coverImageMobilePublicId = uploadResultMobile.public_id;
      } catch (error: any) {
        console.error(
          "🔥 ERROR UPLOAD CLOUDINARY (MOBILE):",
          error.message || error,
        );
        throw new ApiError(
          "Failed to upload new mobile cover image to Cloudinary",
          500,
        );
      }
    }
    // --- SIMPAN KE DATABASE ---
    try {
      const newArticle = await this.prisma.$transaction(async (tx) => {
        const article = await tx.article.create({
          data: {
            title_id: data.title,
            content_id: data.content,
            focusKeywords_id: data.focusKeywords_id,

            title_en: title_en,
            content_en: content_en,
            focusKeywords_en: focusKeywords_en,

            isTranslated: hasTranslation,

            slug,
            source: data.source,
            coverImage: coverImageUrl,
            coverImageId: coverImagePublicId,
            coverImageAlt: data.coverImageAlt,
            coverImageMobile: coverImageMobileUrl,
            coverImageMobileId: coverImageMobilePublicId,

            authorName: data.authorName,
            published: data.published ?? false,
            publishedAt: data.published
              ? data.publishedAt
                ? new Date(data.publishedAt)
                : new Date()
              : null,
            categoryId: data.categoryId,
            authorId: authorId,

            ...(data.seo && {
              seo: {
                create: {
                  metaTitle: data.seo.metaTitle,
                  metaDescription: data.seo.metaDescription,
                  keywords: data.seo.keywords,
                  canonicalUrl: data.seo.canonicalUrl,
                  ogTitle: data.seo.ogTitle,
                  ogDescription: data.seo.ogDescription,
                  ogImage: data.seo.ogImage,
                  robots: data.seo.robots,
                  structuredData: data.seo.structuredData,
                },
              },
            }),
          },
        });

        // 2. Insert Related Products
        if (data.productIds && data.productIds.length > 0) {
          await tx.articleProduct.createMany({
            data: data.productIds.map((productId) => ({
              articleId: article.id,
              productId: productId,
            })),
            skipDuplicates: true,
          });
        }

        // 3. Insert Article Tags
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

      return this.getArticleById(newArticle.id);
    } catch (error) {
      console.error("🔥 ERROR CREATING ARTICLE:", error);
      throw new ApiError(
        "Database error occurred while creating article.",
        500,
      );
    }
  }

  async updateArticle(
    id: string,
    data: UpdateArticleDTO,
    coverFile?: Express.Multer.File,
    coverMobileFile?: Express.Multer.File,
  ) {
    // 1. VALIDASI: Cek artikel exists
    const existing = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Article not found", 404);
    }

    // 2. DESTRUCTURE: Pisahkan relations dari field biasa
    const { productIds, tagIds, ...articleData } = data;

    // 3. HANDLE SLUG: Generate slug baru jika title berubah
    let newSlug = existing.slug;

    if (data.title) {
      newSlug = this.slug.create(data.title);

      if (data.title !== existing.title_id) {
        const duplicate = await this.prisma.article.findFirst({
          where: { slug: newSlug, id: { not: id } },
        });

        if (duplicate) {
          throw new ApiError(
            "Article with this title/slug already exists",
            400,
          );
        }
      }
    }

    // 4. TRANSLATION LOGIC
    let title_en = existing.title_en;
    let content_en = existing.content_en;
    let focusKeywords_en = existing.focusKeywords_en;

    if (
      data.autoTranslate &&
      (data.title || data.content || data.focusKeywords_id)
    ) {
      try {
        if (data.title) {
          if (data.title_en) {
            title_en = data.title_en;
          } else {
            const resTitle = await translate(data.title, { to: "en" });
            title_en = resTitle.text;
          }
        }
        if (data.content) {
          if (data.content_en) {
            content_en = data.content_en;
          } else {
            const resContent = await translate(data.content, { to: "en" });
            content_en = resContent.text;
          }
        }
        if (data.focusKeywords_id) {
          if (data.focusKeywords_en) {
            focusKeywords_en = data.focusKeywords_en;
          } else {
            const resFocusKeywords = await translate(data.focusKeywords_id, {
              to: "en",
            });
            focusKeywords_en = resFocusKeywords.text;
          }
        }
      } catch (err) {
        console.error("Auto-translate failed during update:", err);
        if (data.title_en) title_en = data.title_en;
        if (data.content_en) content_en = data.content_en;
        if (data.focusKeywords_en) focusKeywords_en = data.focusKeywords_en;
      }
    } else {
      if (data.title_en) title_en = data.title_en;
      if (data.content_en) content_en = data.content_en;
      if (data.focusKeywords_en) focusKeywords_en = data.focusKeywords_en;
    }

    const hasTranslation = !!(title_en && content_en);

    // =========================================================================
    // 5. HANDLE DESKTOP COVER IMAGE
    // =========================================================================
    let coverImageUrl = existing.coverImage;
    let coverImagePublicId = existing.coverImageId;

    if (coverFile) {
      // Langkah A: Coba hapus gambar lama, tapi JANGAN biarkan error di sini memblokir proses
      if (existing.coverImageId) {
        try {
          await this.cloudinary.delete(existing.coverImageId);
        } catch (deleteErr) {
          console.warn(
            "⚠️ Peringatan: Gagal menghapus gambar desktop lama (Mungkin sudah terhapus sebelumnya). Mengabaikan...",
            deleteErr,
          );
        }
      }

      // Langkah B: Upload gambar baru
      try {
        const uploadResult = await this.cloudinary.upload(coverFile, {
          folder: "articles/covers",
          resource_type: "image",
        });

        coverImageUrl = uploadResult.secure_url;
        coverImagePublicId = uploadResult.public_id;
      } catch (error) {
        console.error("🔥 ERROR UPLOAD CLOUDINARY (DESKTOP):", error);
        throw new ApiError(
          "Failed to upload new cover image to Cloudinary",
          500,
        );
      }
    }

    // =========================================================================
    // 6. HANDLE MOBILE COVER IMAGE
    // =========================================================================
    let coverImageMobileUrl = existing.coverImageMobile;
    let coverImageMobilePublicId = existing.coverImageMobileId;

    if (coverMobileFile) {
      // Langkah A: Coba hapus gambar lama secara fail-safe
      if (existing.coverImageMobileId) {
        try {
          await this.cloudinary.delete(existing.coverImageMobileId);
        } catch (deleteErr) {
          console.warn(
            "⚠️ Peringatan: Gagal menghapus gambar mobile lama (Mungkin sudah terhapus sebelumnya). Mengabaikan...",
            deleteErr,
          );
        }
      }

      // Langkah B: Upload gambar baru
      try {
        const uploadResultMobile = await this.cloudinary.upload(
          coverMobileFile,
          {
            folder: "articles/covers/mobile",
            resource_type: "image",
          },
        );

        coverImageMobileUrl = uploadResultMobile.secure_url;
        coverImageMobilePublicId = uploadResultMobile.public_id;
      } catch (error) {
        console.error("🔥 ERROR UPLOAD CLOUDINARY (MOBILE):", error);
        throw new ApiError(
          "Failed to upload new mobile cover image to Cloudinary",
          500,
        );
      }
    }

    // 7. BUILD UPDATE DATA
    const updateData: any = {
      ...(data.title && { title_id: data.title }),
      ...(data.content && { content_id: data.content }),
      ...(data.focusKeywords_id && { focusKeywords_id: data.focusKeywords_id }),
      title_en,
      content_en,
      focusKeywords_en,
      slug: newSlug,

      // ✨ SIMPAN STATUS TRANSLATE KE DATABASE
      isTranslated: hasTranslation,

      ...(data.source && { source: data.source }),
      coverImage: coverImageUrl,
      coverImageId: coverImagePublicId,
      ...(data.coverImageAlt && { coverImageAlt: data.coverImageAlt }),
      coverImageMobile: coverImageMobileUrl,
      coverImageMobileId: coverImageMobilePublicId,
      ...(data.authorName && { authorName: data.authorName }),
      ...(data.categoryId && { categoryId: data.categoryId }),
    };

    // 8. HANDLE PUBLISH STATUS & DATE
    if (data.published !== undefined) {
      updateData.published = data.published;
      if (
        data.published === true &&
        !existing.publishedAt &&
        !data.publishedAt
      ) {
        updateData.publishedAt = new Date();
      } else if (data.publishedAt) {
        updateData.publishedAt = new Date(data.publishedAt);
      }
    }

    // 9. HANDLE SEO
    if (data.seo) {
      updateData.seo = {
        upsert: {
          create: {
            metaTitle: data.seo.metaTitle,
            metaDescription: data.seo.metaDescription,
            keywords: data.seo.keywords,
            canonicalUrl: data.seo.canonicalUrl,
            ogTitle: data.seo.ogTitle,
            ogDescription: data.seo.ogDescription,
            ogImage: data.seo.ogImage,
            robots: data.seo.robots,
            structuredData: data.seo.structuredData,
          },
          update: {
            metaTitle: data.seo.metaTitle,
            metaDescription: data.seo.metaDescription,
            keywords: data.seo.keywords,
            canonicalUrl: data.seo.canonicalUrl,
            ogTitle: data.seo.ogTitle,
            ogDescription: data.seo.ogDescription,
            ogImage: data.seo.ogImage,
            robots: data.seo.robots,
            structuredData: data.seo.structuredData,
          },
        },
      };
    }

    // 10. EXECUTE UPDATE
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const article = await tx.article.update({
          where: { id },
          data: updateData,
        });

        // 11. SYNC RELATED PRODUCTS
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
              skipDuplicates: true,
            });
          }
        }

        // 12. SYNC ARTICLE TAGS
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
              skipDuplicates: true,
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
        seo: true,
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
        seo: true, // Pastikan SEO ikut ditarik
      },
    });

    if (!article || !article.published) {
      throw new ApiError("Article not found or not published", 404);
    }

    const relevantArticles = await this.getRelevantArticles(
      article.categoryId,
      article.id,
    );

    // Perbaikan: Gunakan title_id karena model sudah berubah
    const prevArticle = await this.prisma.article.findFirst({
      where: {
        published: true,
        createdAt: { lt: article.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { title_id: true, slug: true },
    });

    const nextArticle = await this.prisma.article.findFirst({
      where: {
        published: true,
        createdAt: { gt: article.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: { title_id: true, slug: true },
    });

    return {
      ...article,
      relevantArticles,
      prevArticle: prevArticle
        ? { title: prevArticle.title_id, href: `/article/${prevArticle.slug}` }
        : null,
      nextArticle: nextArticle
        ? { title: nextArticle.title_id, href: `/article/${nextArticle.slug}` }
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
      // ✨ Menggunakan OR agar sistem mencari di judul bahasa Indonesia ATAU bahasa Inggris
      where.OR = [
        { title_id: { contains: query.search } },
        { title_en: { contains: query.search } },
      ];
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
