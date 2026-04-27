import * as argon2 from "argon2";
import "dotenv/config";
import "reflect-metadata"; // Wajib untuk tsyringge
import { container } from "tsyringe";
import { PrismaService } from "../src/modules/prisma/prisma.service";

async function main() {
  // ✨ Resolve PrismaService dari container tsyringe
  const prisma = container.resolve(PrismaService);

  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
  });

  if (existingSuperAdmin) {
    console.log("✅ SUPER_ADMIN already exists. Skipping seed.");
    return;
  }

  const hashedPassword = await argon2.hash("superadmin123", {
    type: argon2.argon2id,
  });

  await prisma.user.upsert({
    where: { email: "superadmin@goenakan.id" },
    update: {
      password: hashedPassword,
      role: "SUPER_ADMIN",
      name: "Super Admin",
    },
    create: {
      name: "Super Admin",
      email: "superadmin@goenakan.id",
      password: hashedPassword,
      role: "SUPER_ADMIN",
    },
  });

  console.log("🚀 SUPER_ADMIN password has been synced to: superadmin123");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    const prisma = container.resolve(PrismaService);
    await prisma.$disconnect();
  });
