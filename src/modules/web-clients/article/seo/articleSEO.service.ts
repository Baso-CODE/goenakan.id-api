import { injectable } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { PrismaService } from "../../../prisma/prisma.service";
import { ArticleSeoDTO } from "../dto/articleSEO.dto";

@injectable()
export class ArticleSeoService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // 1. UPSERT SEO (Create jika belum ada, Update jika sudah ada)
  // =========================================================================
  /**
   * Menggunakan Upsert karena relasi One-to-One.
   * Sangat cocok dipanggil saat admin menyimpan tab "SEO" di dashboard.
   */
  async upsertArticleSeo(articleId: string, data: ArticleSeoDTO) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true },
    });

    if (!article) {
      throw new ApiError("Article not found. Cannot add SEO data.", 404);
    }

    try {
      const seoData = await this.prisma.articleSEO.upsert({
        where: { articleId: articleId },
        update: {
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          keywords: data.keywords,
          canonicalUrl: data.canonicalUrl,
          ogTitle: data.ogTitle,
          ogDescription: data.ogDescription,
          ogImage: data.ogImage,
          robots: data.robots,
          structuredData: data.structuredData,
        },
        create: {
          articleId: articleId,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          keywords: data.keywords,
          canonicalUrl: data.canonicalUrl,
          ogTitle: data.ogTitle,
          ogDescription: data.ogDescription,
          ogImage: data.ogImage,
          robots: data.robots,
          structuredData: data.structuredData,
        },
      });

      return seoData;
    } catch (error) {
      console.error("🔥 ERROR UPSERTING ARTICLE SEO:", error);
      throw new ApiError("Failed to save Article SEO data", 500);
    }
  }

  // =========================================================================
  // 2. GET SEO BY ARTICLE ID
  // =========================================================================
  /**
   * Mengambil data SEO spesifik untuk satu artikel.
   * Berguna untuk mengisi form saat admin mengedit data.
   */
  async getSeoByArticleId(articleId: string) {
    try {
      const seoData = await this.prisma.articleSEO.findUnique({
        where: { articleId: articleId },
      });

      // Boleh return null jika memang belum pernah di-set SEO-nya
      return seoData;
    } catch (error) {
      console.error("🔥 ERROR FETCHING ARTICLE SEO:", error);
      throw new ApiError("Failed to fetch Article SEO data", 500);
    }
  }

  // =========================================================================
  // 3. DELETE SEO (Opsional)
  // =========================================================================
  /**
   * Menghapus data SEO secara eksplisit.
   * (Meskipun sudah ada onDelete: Cascade di schema yang otomatis menghapus
   * ini jika artikelnya dihapus).
   */
  async deleteArticleSeo(articleId: string) {
    // Cek apakah data SEO ada
    const existing = await this.prisma.articleSEO.findUnique({
      where: { articleId: articleId },
    });

    if (!existing) {
      throw new ApiError("SEO data not found for this article", 404);
    }

    try {
      const deleted = await this.prisma.articleSEO.delete({
        where: { articleId: articleId },
      });
      return deleted;
    } catch (error) {
      console.error("🔥 ERROR DELETING ARTICLE SEO:", error);
      throw new ApiError("Failed to delete Article SEO data", 500);
    }
  }
}
