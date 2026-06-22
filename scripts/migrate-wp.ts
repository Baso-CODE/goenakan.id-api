import "reflect-metadata"; // ⚠️ WAJIB di-import paling atas saat menggunakan tsyringe
import { container } from "tsyringe";

// Sesuaikan path import PrismaService dengan lokasi asli file Anda
import { PrismaService } from "../src/modules/prisma/prisma.service";

// Gunakan URL REST API WordPress Anda
const WP_API_URL =
  "https://goenakan.id/wp-json/wp/v2/posts?per_page=100&_embed";

// ⚠️ GANTI DENGAN UUID DARI DATABASE BARU ANDA
const DEFAULT_AUTHOR_ID = "988a6c6f-fd65-4741-928c-b12e7cc63f48";
const DEFAULT_CATEGORY_ID = "6472af71-74db-4dff-ac73-7a78433bc458";

async function migrateWordPressArticles() {
  // 1. Ambil instance PrismaService dari container tsyringe
  // Ini akan sama persis perilakunya seperti this.prisma di dalam service Anda
  const prisma = container.resolve(PrismaService);

  try {
    console.log("📥 Mengambil data dari WordPress...");
    const response = await fetch(WP_API_URL);
    const wpArticles = await response.json();

    console.log(`Menemukan ${wpArticles.length} artikel. Memulai migrasi...`);

    for (const wp of wpArticles) {
      console.log(`⚙️ Memproses: ${wp.title.rendered}`);

      // Gunakan prisma layaknya di Service Anda
      const existing = await prisma.article.findUnique({
        where: { slug: wp.slug },
      });

      if (existing) {
        console.log(`⏩ Skip (Sudah ada): ${wp.title.rendered}`);
        continue;
      }

      let coverImageUrl = "https://via.placeholder.com/800x400?text=No+Cover";
      if (wp._embedded && wp._embedded["wp:featuredmedia"]) {
        coverImageUrl = wp._embedded["wp:featuredmedia"][0].source_url;
      }

      let authorName = "Admin Goenakan";
      if (wp._embedded && wp._embedded.author) {
        authorName = wp._embedded.author[0].name;
      }

      const yoast = wp.yoast_head_json;
      let seoData = {};
      if (yoast) {
        seoData = {
          metaTitle: yoast.title?.substring(0, 255) || null,
          metaDescription: yoast.description || null,
          canonicalUrl: yoast.canonical?.substring(0, 255) || null,
          ogTitle: yoast.og_title?.substring(0, 255) || null,
          ogDescription: yoast.og_description || null,
          ogImage: yoast.og_image
            ? yoast.og_image[0]?.url?.substring(0, 255)
            : null,
          robots: "index, follow",
        };
      }

      // Insert ke Database menggunakan prisma service Anda
      await prisma.article.create({
        data: {
          slug: wp.slug,

          title_id: wp.title.rendered,
          content_id: wp.content.rendered,
          focusKeywords_id: null,

          title_en: null,
          content_en: null,
          focusKeywords_en: null,

          coverImage: coverImageUrl,
          coverImageAlt: wp.title.rendered,

          published: wp.status === "publish",
          publishedAt: new Date(wp.date),

          authorName: authorName,
          authorId: DEFAULT_AUTHOR_ID,
          categoryId: DEFAULT_CATEGORY_ID,

          seo:
            Object.keys(seoData).length > 0
              ? {
                  create: seoData,
                }
              : undefined,
        },
      });

      console.log(`✅ Berhasil migrasi: ${wp.title.rendered}`);
    }

    console.log("🎉 MIGRASI SELESAI!");
  } catch (error) {
    console.error("🔥 Gagal melakukan migrasi:", error);
  } finally {
    // Memutuskan koneksi database setelah selesai
    await prisma.$disconnect();
  }
}

migrateWordPressArticles();
