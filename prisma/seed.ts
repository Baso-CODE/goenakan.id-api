import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

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

  await prisma.user.create({
    data: {
      name: "Super Admin",
      email: "superadmin@goenakan.id",
      password: hashedPassword,
      role: "SUPER_ADMIN",
    },
  });

  console.log("🚀 SUPER_ADMIN has been created!");
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
