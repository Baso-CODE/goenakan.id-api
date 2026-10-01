import dotenv from "dotenv";
dotenv.config();

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is not defined in .env");
  process.exit(1);
}

const adapter = new PrismaMariaDb(connectionString);
const prisma = new PrismaClient({ adapter });

async function main() {
  const jsonPath = path.resolve(
    "/home/spil/.gemini/antigravity-cli/brain/3b139994-1405-464e-8983-7b25866a042f/scratch/dry_run_results.json",
  );

  if (!fs.existsSync(jsonPath)) {
    console.error("❌ File dry_run_results.json tidak ditemukan!");
    process.exit(1);
  }

  const items: { id: string; newNameEn: string }[] = JSON.parse(
    fs.readFileSync(jsonPath, "utf8"),
  );

  console.log("=================================================");
  console.log("🚀 MENERAPKAN PEMBARUAN NAME_EN KE DATABASE");
  console.log(`📦 Total produk yang akan diperbarui: ${items.length}`);
  console.log("=================================================\n");

  let successCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let newNameEn = item.newNameEn.trim();

    // Sanitize any odd translation glitch (e.g. HandFan)
    if (newNameEn.toLowerCase().includes("handfuck")) {
      newNameEn = newNameEn.replace(/handfuck/gi, "Hand Fan");
    }

    const updated = await prisma.product.update({
      where: { id: item.id },
      data: { name_en: newNameEn },
      select: {
        id: true,
        name: true,
        name_en: true,
        itemName: { select: { name: true } },
      },
    });

    console.log(
      `[${i + 1}/${items.length}] ✅ Updated: "${updated.name}" (Item: ${updated.itemName?.name || "-"}) => "${updated.name_en}"`,
    );
    successCount++;
  }

  console.log("\n=================================================");
  console.log(`🎉 Berhasil memperbarui ${successCount} produk di database!`);
  console.log("=================================================\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Fatal error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
