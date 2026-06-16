import * as argon2 from "argon2"; // Jangan lupa import argon2 kembali
import "dotenv/config";
import "reflect-metadata"; // Wajib untuk tsyringe
import { container } from "tsyringe";
import { PrismaService } from "../src/modules/prisma/prisma.service";

async function main() {
  // ✨ Resolve PrismaService dari container tsyringe
  const prisma = container.resolve(PrismaService);

  // --- 1. SEED DATA ROLE TERLEBIH DAHULU ---
  console.log("⏳ Syncing roles to database...");
  const defaultRoles = [
    "SUPER_ADMIN",
    "ADMIN_ARTICLE",
    "ADMIN_INVOICE",
    "CUSTOMER",
  ];

  for (const roleName of defaultRoles) {
    // Tetap gunakan prisma.role, bukan prisma.roles
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
  }
  console.log("✅ Roles synced successfully.");

  // --- 2. CEK EXISTING SUPER ADMIN ---
  const existingSuperAdmin = await prisma.user.findFirst({
    where: {
      role: {
        name: "SUPER_ADMIN",
      },
    },
  });

  if (existingSuperAdmin) {
    console.log("✅ SUPER_ADMIN already exists. Skipping user seed.");
    return;
  }

  const hashedPassword = await argon2.hash("superadmin123", {
    type: argon2.argon2id,
  });

  // --- 3. BUAT USER DAN HUBUNGKAN DENGAN ROLE ---
  await prisma.user.upsert({
    where: { email: "superadmin@goenakan.id" },
    update: {
      password: hashedPassword,
      name: "Super Admin",
      role: {
        connect: { name: "SUPER_ADMIN" },
      },
    },
    create: {
      name: "Super Admin",
      email: "superadmin@goenakan.id",
      password: hashedPassword,
      role: {
        connect: { name: "SUPER_ADMIN" },
      },
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
