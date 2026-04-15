import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
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

  // 2. Gunakan UPSERT (Update jika ada, Create jika belum ada)
  // Pastikan 'email' bersifat unique di schema.prisma kamu
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
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
