import "dotenv/config";
import "reflect-metadata";
import { container } from "tsyringe";
import { PrismaService } from "../src/modules/prisma/prisma.service";

async function main() {
  // 1. Mengambil instance Prisma dari Tsyringe Container
  const prisma = container.resolve(PrismaService);

  // 2. Daftar tipe atribut yang akan dimasukkan ke database
  const typesToSeed = [
    { name: "TEXT", isCustom: false },
    { name: "CUSTOM", isCustom: false },
    { name: "COLOR", isCustom: false },
    { name: "MODEL_SHAPE", isCustom: false },
    { name: "MOCKUP_SIDE", isCustom: true },
    { name: "PRINT_METHOD", isCustom: true },
    { name: "SIZE", isCustom: false },
  ];

  console.log("⏳ Mulai seeding attribute_types...");

  // 3. Looping dan Upsert data
  for (const type of typesToSeed) {
    await prisma.attributeType.upsert({
      where: { name: type.name },
      update: {},
      create: {
        name: type.name,
        isActive: true,
        isCustom: type.isCustom,
      },
    });
  }

  console.log("✅ Seeding attribute_types berhasil diselesaikan.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // Memastikan koneksi ditutup dengan benar setelah selesai
    const prisma = container.resolve(PrismaService);
    await prisma.$disconnect();
  });
