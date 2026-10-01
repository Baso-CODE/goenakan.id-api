import dotenv from "dotenv";
dotenv.config();

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { translate } from "@vitalets/google-translate-api";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is not defined in .env");
  process.exit(1);
}

const adapter = new PrismaMariaDb(connectionString);
const prisma = new PrismaClient({ adapter });

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Menerjemahkan teks dengan mekanisme retry dan backoff jika terjadi rate-limiting (HTTP 429)
 */
async function translateWithRetry(
  text: string,
  targetLang: string = "en",
  maxRetries: number = 3,
): Promise<string> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const res = await translate(text, { to: targetLang });
      return res.text?.trim() || text;
    } catch (err: any) {
      attempt++;
      console.warn(
        `   ⚠️ [Retry ${attempt}/${maxRetries}] Translate gagal: ${err.message}. Menunggu ${attempt * 2} detik...`,
      );
      if (attempt >= maxRetries) {
        throw err;
      }
      await sleep(attempt * 2000);
    }
  }
  return text;
}

/**
 * Menghitung name_en dengan menjaga Item Name (brand/series) tetap utuh
 */
export async function computeTranslatedProductName(
  productName: string,
  itemNameString?: string | null,
): Promise<string | null> {
  if (!productName || !productName.trim()) return null;

  let prefix = "";
  let textToTranslate = productName.trim();

  if (itemNameString && itemNameString.trim()) {
    const cleanItemName = itemNameString.trim();
    const escapedItem = cleanItemName.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    const regex = new RegExp(`^${escapedItem}(?:\\s*[-–:]?\\s+|\\s*$)`, "i");

    if (regex.test(textToTranslate)) {
      prefix = cleanItemName;
      textToTranslate = textToTranslate.replace(regex, "").trim();
    }
  }

  if (textToTranslate) {
    const resText = await translateWithRetry(textToTranslate, "en");
    return prefix ? `${prefix} ${resText}` : resText;
  }

  return prefix || productName;
}

async function main() {
  const isApply = process.argv.includes("--apply");
  console.log("=================================================");
  console.log("🚀 MIGRATION: Auto-Translate Product Names");
  console.log(`📌 Mode: ${isApply ? "🔥 APPLY (Update Database)" : "👀 DRY-RUN (Preview Only, jalankan dengan --apply untuk menyimpan)"}`);
  console.log("=================================================\n");

  const products = await prisma.product.findMany({
    orderBy: { createdAt: "asc" },
    include: { itemName: true },
  });

  console.log(`📦 Ditemukan ${products.length} total produk di database.\n`);

  let updatedCount = 0;
  let unchangedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const indexStr = `[${i + 1}/${products.length}]`;
    const itemName = p.itemName?.name || null;

    try {
      const newNameEn = await computeTranslatedProductName(p.name, itemName);

      if (!newNameEn) {
        console.log(`${indexStr} ⏩ [SKIP] "${p.name}": nama kosong`);
        unchangedCount++;
        continue;
      }

      const isChanged = newNameEn !== p.name_en;

      if (isChanged) {
        console.log(`${indexStr} 🔄 [UPDATE PERLU]`);
        console.log(`   ID       : ${p.id}`);
        console.log(`   ItemName : ${itemName ? `"${itemName}"` : "(none)"}`);
        console.log(`   ID Name  : "${p.name}"`);
        console.log(`   OLD EN   : ${p.name_en ? `"${p.name_en}"` : "NULL"}`);
        console.log(`   NEW EN   : "${newNameEn}"`);

        if (isApply) {
          await prisma.product.update({
            where: { id: p.id },
            data: { name_en: newNameEn },
          });
          console.log(`   ✅ Tersimpan ke database!`);
        }
        console.log("   -------------------------------------------------");
        updatedCount++;
      } else {
        console.log(`${indexStr} 🆗 [SESUAI] "${p.name}" => "${p.name_en}"`);
        unchangedCount++;
      }

      // Jeda 350ms antar produk agar tidak terkena rate limit Google Translate
      await sleep(350);
    } catch (err: any) {
      console.error(`${indexStr} ❌ [ERROR] "${p.name}":`, err.message);
      failedCount++;
    }
  }

  console.log("\n=================================================");
  console.log("📊 RINGKASAN MIGRASI");
  console.log("=================================================");
  console.log(`Total Produk Diproses : ${products.length}`);
  console.log(`Perlu Update / Berubah: ${updatedCount}`);
  console.log(`Sudah Sesuai (Skip)   : ${unchangedCount}`);
  console.log(`Gagal                 : ${failedCount}`);
  if (!isApply) {
    console.log("\n💡 Catatan: Ini adalah DRY-RUN. Jalankan kembali dengan flag `--apply` untuk menyimpan perubahan ke database:");
    console.log("   npx ts-node -r dotenv/config scripts/migrate-translate-products.ts --apply");
  } else {
    console.log("\n🎉 Migrasi selesai dan database telah diperbarui!");
  }
  console.log("=================================================\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Fatal error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
