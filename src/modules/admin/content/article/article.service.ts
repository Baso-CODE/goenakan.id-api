import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { translateWithDeepL } from "../../../../utils/deepl-translate";
import { SlugService } from "../../../../utils/genereateSlug";
import { CloudinaryService } from "../../../cloudinary/cloudinary.service";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
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

    // =====================================================
    // 1. TRANSLATION - DEEPL API
    // =====================================================

    // Prioritaskan input bahasa Inggris manual dari admin.
    let title_en = data.title_en?.trim() || undefined;
    let content_en = data.content_en?.trim() || undefined;
    let focusKeywords_en = data.focusKeywords_en?.trim() || undefined;

    if (data.autoTranslate) {
      // Translate judul
      if (!title_en && data.title?.trim()) {
        try {
          title_en = await translateWithDeepL(data.title.trim());
        } catch (error) {
          console.error("❌ DeepL failed to translate article title:", error);
        }
      }

      // Translate konten HTML dari Tiptap
      if (!content_en && data.content?.trim()) {
        try {
          content_en = await translateWithDeepL(
            data.content,
            true, // Aktifkan HTML translation
          );
        } catch (error) {
          console.error("❌ DeepL failed to translate article content:", error);
        }
      }

      // Translate focus keywords
      if (!focusKeywords_en && data.focusKeywords_id?.trim()) {
        try {
          focusKeywords_en = await translateWithDeepL(
            data.focusKeywords_id.trim(),
          );
        } catch (error) {
          console.error("❌ DeepL failed to translate focus keywords:", error);
        }
      }
    }

    // Artikel dinyatakan diterjemahkan jika judul dan
    // konten bahasa Inggris sama-sama tersedia.
    const hasTranslation = Boolean(title_en && content_en);

    // =====================================================
    // 2. UPLOAD COVER IMAGE DESKTOP
    // =====================================================

    let coverImageUrl = data.coverImage;
    let coverImagePublicId = data.coverImageId;

    if (coverImagePublicId === "null" || coverImagePublicId === "undefined") {
      coverImagePublicId = null;
    }

    if (coverFile) {
      try {
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
        console.error("🔥 CLOUDINARY ERROR", JSON.stringify(error, null, 2));

        throw new ApiError(
          "Failed to upload new cover image to Cloudinary",
          500,
        );
      }
    }

    if (!coverImageUrl) {
      throw new ApiError("Cover image desktop is required", 400);
    }

    // =====================================================
    // 3. UPLOAD COVER IMAGE MOBILE
    // =====================================================

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
        console.error("🔥 CLOUDINARY ERROR", JSON.stringify(error, null, 2));

        throw new ApiError(
          "Failed to upload new mobile cover image to Cloudinary",
          500,
        );
      }
    }

    // =====================================================
    // 4. PREPARE RELATIONS
    // =====================================================

    const productIds = [...new Set((data.productIds ?? []).filter(Boolean))];

    const tagIds = [...new Set((data.tagIds ?? []).filter(Boolean))];

    // =====================================================
    // 5. DATABASE TRANSACTION
    // =====================================================

    try {
      const newArticle = await this.prisma.$transaction(async (tx) => {
        // Validasi seluruh Tag ID
        if (tagIds.length > 0) {
          const existingTags = await tx.tag.findMany({
            where: {
              id: { in: tagIds },
            },
            select: { id: true },
          });

          if (existingTags.length !== tagIds.length) {
            const existingTagIds = new Set(existingTags.map((tag) => tag.id));

            const invalidTagIds = tagIds.filter(
              (tagId) => !existingTagIds.has(tagId),
            );

            throw new ApiError(
              `Invalid tag ID(s): ${invalidTagIds.join(", ")}`,
              400,
            );
          }
        }

        // Create Article
        const article = await tx.article.create({
          data: {
            // Indonesian
            title_id: data.title,
            content_id: data.content,
            focusKeywords_id: data.focusKeywords_id,

            // English - DeepL atau input manual
            title_en,
            content_en,
            focusKeywords_en,
            isTranslated: hasTranslation,

            // General
            slug,
            source: data.source,

            // Cover Desktop
            coverImage: coverImageUrl,
            coverImageId: coverImagePublicId,
            coverImageAlt: data.coverImageAlt,

            // Cover Mobile
            coverImageMobile: coverImageMobileUrl,
            coverImageMobileId: coverImageMobilePublicId,

            // Author & Publication
            authorName: data.authorName,
            published: data.published ?? false,
            publishedAt: data.published
              ? data.publishedAt
                ? new Date(data.publishedAt)
                : new Date()
              : null,

            categoryId: data.categoryId,
            authorId,

            // Tags
            ...(tagIds.length > 0 && {
              tags: {
                connect: tagIds.map((id) => ({ id })),
              },
            }),

            // SEO Metadata
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

        // Related Products
        if (productIds.length > 0) {
          await tx.articleProduct.createMany({
            data: productIds.map((productId) => ({
              articleId: article.id,
              productId,
            })),
            skipDuplicates: true,
          });
        }

        return article;
      });

      return this.getArticleById(newArticle.id);
    } catch (error) {
      console.error("🔥 ERROR CREATING ARTICLE:", error);

      if (error instanceof ApiError) {
        throw error;
      }

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
    const existing = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Article not found", 404);
    }

    const { productIds, tagIds } = data;

    // =====================================================
    // 1. VALIDATE ARTICLE SLUG
    // =====================================================

    let newSlug = existing.slug;

    if (data.title !== undefined && data.title !== existing.title_id) {
      newSlug = this.slug.create(data.title);

      const duplicate = await this.prisma.article.findFirst({
        where: {
          slug: newSlug,
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new ApiError("Article with this title/slug already exists", 400);
      }
    }

    // =====================================================
    // 2. TRANSLATION - DEEPL API
    // =====================================================

    const translateField = async (
      currentValue: string | null,
      manualValue: string | undefined,
      sourceText: string | undefined,
      sourceChanged: boolean,
      isHtml: boolean,
      fieldName: string,
    ): Promise<string | null> => {
      const manualText = manualValue?.trim();

      // Input Inggris manual selalu diprioritaskan.
      if (manualText) {
        return manualText;
      }

      // Terjemahkan jika autoTranslate aktif dan:
      // - teks Indonesia berubah; atau
      // - field Inggris dikirim dalam keadaan kosong.
      const shouldTranslate =
        data.autoTranslate === true &&
        Boolean(sourceText?.trim()) &&
        (sourceChanged || manualValue !== undefined);

      if (shouldTranslate && sourceText) {
        try {
          return await translateWithDeepL(sourceText, isHtml);
        } catch (error) {
          console.error(`❌ DeepL failed to translate ${fieldName}:`, error);

          // Jangan hilangkan nilai sebelumnya jika API gagal.
          return currentValue;
        }
      }

      // Jika field Inggris sengaja dikosongkan dan
      // autoTranslate tidak dijalankan, kosongkan nilainya.
      if (manualValue !== undefined) {
        return manualValue.trim();
      }

      // Tidak ada perubahan: pertahankan data lama.
      return currentValue;
    };

    const title_en = await translateField(
      existing.title_en,
      data.title_en,
      data.title ?? existing.title_id,
      data.title !== undefined && data.title !== existing.title_id,
      false,
      "article title",
    );

    const content_en = await translateField(
      existing.content_en,
      data.content_en,
      data.content ?? existing.content_id,
      data.content !== undefined && data.content !== existing.content_id,
      true, // Konten Tiptap berbentuk HTML.
      "article content",
    );

    const focusKeywords_en = await translateField(
      existing.focusKeywords_en,
      data.focusKeywords_en,
      data.focusKeywords_id ?? existing.focusKeywords_id ?? "",
      data.focusKeywords_id !== undefined &&
        data.focusKeywords_id !== existing.focusKeywords_id,
      false,
      "focus keywords",
    );

    const hasTranslation = Boolean(title_en?.trim() && content_en?.trim());

    // =====================================================
    // 3. UPLOAD COVER IMAGES - CLOUDINARY
    // =====================================================

    let coverImageUrl = existing.coverImage;
    let coverImagePublicId = existing.coverImageId;

    let coverImageMobileUrl = existing.coverImageMobile;
    let coverImageMobilePublicId = existing.coverImageMobileId;

    // Catat ID gambar baru agar bisa dibersihkan
    // jika proses upload atau database gagal.
    const newlyUploadedIds: string[] = [];

    const cleanupNewUploads = async () => {
      await Promise.allSettled(
        newlyUploadedIds.map(async (publicId) => {
          try {
            await this.cloudinary.delete(publicId);
          } catch (error) {
            console.error(
              "Failed to clean up newly uploaded image:",
              publicId,
              error,
            );
          }
        }),
      );
    };

    try {
      // Desktop cover
      if (coverFile) {
        if (!coverFile.buffer) {
          throw new ApiError("Desktop cover file buffer is empty", 400);
        }

        const uploadResult = await this.cloudinary.upload(coverFile, {
          folder: "articles/covers",
          resource_type: "image",
        });

        coverImageUrl = uploadResult.secure_url;
        coverImagePublicId = uploadResult.public_id;

        newlyUploadedIds.push(uploadResult.public_id);
      }

      // Mobile cover
      if (coverMobileFile) {
        if (!coverMobileFile.buffer) {
          throw new ApiError("Mobile cover file buffer is empty", 400);
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

        newlyUploadedIds.push(uploadResultMobile.public_id);
      }
    } catch (error) {
      await cleanupNewUploads();

      console.error("🔥 CLOUDINARY UPLOAD ERROR:", error);

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(
        "Failed to upload article cover image to Cloudinary",
        500,
      );
    }

    // =====================================================
    // 4. NORMALIZE RELATIONS
    // =====================================================

    const normalizedProductIds =
      productIds !== undefined
        ? [...new Set(productIds.filter(Boolean))]
        : undefined;

    const normalizedTagIds =
      tagIds !== undefined ? [...new Set(tagIds.filter(Boolean))] : undefined;

    // =====================================================
    // 5. DATABASE TRANSACTION
    // =====================================================

    let updated: { id: string };

    try {
      updated = await this.prisma.$transaction(async (tx) => {
        // Validate tag IDs
        if (normalizedTagIds !== undefined && normalizedTagIds.length > 0) {
          const existingTags = await tx.tag.findMany({
            where: {
              id: { in: normalizedTagIds },
            },
            select: { id: true },
          });

          if (existingTags.length !== normalizedTagIds.length) {
            const existingTagIds = new Set(existingTags.map((tag) => tag.id));

            const invalidTagIds = normalizedTagIds.filter(
              (tagId) => !existingTagIds.has(tagId),
            );

            throw new ApiError(
              `Invalid tag ID(s): ${invalidTagIds.join(", ")}`,
              400,
            );
          }
        }

        const updateData: any = {
          // Indonesian
          ...(data.title !== undefined && {
            title_id: data.title,
          }),
          ...(data.content !== undefined && {
            content_id: data.content,
          }),
          ...(data.focusKeywords_id !== undefined && {
            focusKeywords_id: data.focusKeywords_id,
          }),

          // English - manual / DeepL
          title_en,
          content_en,
          focusKeywords_en,
          isTranslated: hasTranslation,

          // Slug
          slug: newSlug,

          // Source
          ...(data.source !== undefined && {
            source: data.source,
          }),

          // Desktop cover
          coverImage: coverImageUrl,
          coverImageId: coverImagePublicId,

          ...(data.coverImageAlt !== undefined && {
            coverImageAlt: data.coverImageAlt,
          }),

          // Mobile cover
          coverImageMobile: coverImageMobileUrl,
          coverImageMobileId: coverImageMobilePublicId,

          // Author
          ...(data.authorName !== undefined && {
            authorName: data.authorName,
          }),

          // Category
          ...(data.categoryId !== undefined && {
            categoryId: data.categoryId,
          }),

          // Tags
          ...(normalizedTagIds !== undefined && {
            tags: {
              set: normalizedTagIds.map((tagId) => ({
                id: tagId,
              })),
            },
          }),
        };

        // =====================================================
        // PUBLICATION STATUS
        // =====================================================

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
        } else if (data.publishedAt) {
          updateData.publishedAt = new Date(data.publishedAt);
        }

        // =====================================================
        // SEO METADATA
        // =====================================================

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

        // =====================================================
        // UPDATE ARTICLE
        // =====================================================

        const article = await tx.article.update({
          where: { id },
          data: updateData,
        });

        // =====================================================
        // RELATED PRODUCTS
        // =====================================================

        if (normalizedProductIds !== undefined) {
          await tx.articleProduct.deleteMany({
            where: { articleId: id },
          });

          if (normalizedProductIds.length > 0) {
            await tx.articleProduct.createMany({
              data: normalizedProductIds.map((productId) => ({
                articleId: id,
                productId,
              })),
              skipDuplicates: true,
            });
          }
        }

        return article;
      });
    } catch (error) {
      // Jika DB gagal, hapus gambar yang baru diunggah.
      // Gambar lama masih aman karena belum dihapus.
      await cleanupNewUploads();

      console.error("🔥 ERROR UPDATING ARTICLE:", error);

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(
        "Database error occurred while updating article.",
        500,
      );
    }

    // =====================================================
    // 6. DELETE OLD CLOUDINARY IMAGES AFTER DB SUCCESS
    // =====================================================

    const oldImageIdsToDelete: string[] = [];

    if (
      coverFile &&
      existing.coverImageId &&
      existing.coverImageId !== coverImagePublicId
    ) {
      oldImageIdsToDelete.push(existing.coverImageId);
    }

    if (
      coverMobileFile &&
      existing.coverImageMobileId &&
      existing.coverImageMobileId !== coverImageMobilePublicId
    ) {
      oldImageIdsToDelete.push(existing.coverImageMobileId);
    }

    // Cleanup best-effort, tidak membatalkan update artikel.
    if (oldImageIdsToDelete.length > 0) {
      await Promise.allSettled(
        oldImageIdsToDelete.map(async (publicId) => {
          try {
            await this.cloudinary.delete(publicId);
          } catch (error) {
            console.warn(
              "Failed to delete old Cloudinary image:",
              publicId,
              error,
            );
          }
        }),
      );
    }

    // =====================================================
    // 7. RETURN UPDATED ARTICLE
    // =====================================================

    return this.getArticleById(updated.id);
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
          category: { select: { name_id: true, name_en: true } },
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
          select: {
            id: true,
            name: true,
          },
        },
        tags: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
          orderBy: {
            name: "asc",
          },
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
        seo: true,
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
      orderBy: {
        createdAt: "desc",
      },
      select: {
        title_id: true,
        title_en: true,
        slug: true,
      },
    });

    const nextArticle = await this.prisma.article.findFirst({
      where: {
        published: true,
        createdAt: { gt: article.createdAt },
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        title_id: true,
        title_en: true,
        slug: true,
      },
    });

    return {
      ...article,
      relevantArticles,
      prevArticle: prevArticle
        ? {
            title_id: prevArticle.title_id,
            title_en: prevArticle.title_en,
            slug: prevArticle.slug,
            href: `/article/${prevArticle.slug}`,
          }
        : null,
      nextArticle: nextArticle
        ? {
            title_id: nextArticle.title_id,
            title_en: nextArticle.title_en,
            slug: nextArticle.slug,
            href: `/article/${nextArticle.slug}`,
          }
        : null,
    };
  }

  async getAllArticles(query: {
    page?: number;
    take?: number;
    search?: string;
    categoryId?: string;
    published?: boolean | string;
    authorId?: string;
  }) {
    const where: any = {};

    if (query.search) {
      where.OR = [
        { title_id: { contains: query.search } },
        { title_en: { contains: query.search } },
      ];
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.authorId) {
      where.authorId = query.authorId;
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
        category: {
          select: { id: true, name_id: true, name_en: true, slug: true },
        },
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
    locale?: string;
  }) {
    const where: any = {
      published: true,
    };

    // ✨ LOGIKA PENCARIAN (Mencari di judul ID maupun EN)
    if (query.search) {
      where.OR = [
        { title_id: { contains: query.search } },
        { title_en: { contains: query.search } },
        // Opsional: Kamu bisa membuka komentar di bawah jika ingin pencarian juga mengecek isi konten
        // { content_id: { contains: query.search, } },
        // { content_en: { contains: query.search, } },
      ];
    }

    // Filter Kategori (Jika ada)
    if (
      query.categoryName &&
      query.categoryName !== "All posts" &&
      query.categoryName !== "Semua Postingan"
    ) {
      // Kita gunakan OR karena kategori yang dikirim dari frontend bisa berupa bahasa Inggris atau Indonesia
      where.category = {
        OR: [{ name_id: query.categoryName }, { name_en: query.categoryName }],
      };
    }

    // Hitung total data untuk keperluan pagination (meta.hasNext)
    const count = await this.prisma.article.count({ where });

    const orderBy: any = {};
    if (query.sort === "older") {
      orderBy.publishedAt = "asc";
    } else {
      orderBy.publishedAt = "desc";
    }

    // Ambil data dari database dengan paginasi
    const data = await this.prisma.article.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 6),
      take: Number(query.take || 6),
      orderBy: orderBy,
      include: {
        category: {
          select: { id: true, name_id: true, name_en: true, slug: true },
        },
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

  // === GET ARTICLE SIMPLE LIST (ID & TITLES ONLY) ===
  async getArticleSimpleList() {
    try {
      const data = await this.prisma.article.findMany({
        select: {
          id: true,
          title_id: true,
          title_en: true,
          slug: true, // Tambahkan slug untuk auto-generate CTA
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      });

      return { data };
    } catch (error) {
      console.error("❌ Error in getArticleSimpleList:", error);
      throw new Error("Failed to fetch article simple list");
    }
  }
}
