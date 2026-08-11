import * as argon2 from "argon2";
import "dotenv/config";
import "reflect-metadata";
import { container } from "tsyringe";
import { PrismaService } from "../src/modules/prisma/prisma.service";

async function main() {
  const prisma = container.resolve(PrismaService);

  // 1. Sinkronisasi Roles
  await prisma.role.upsert({
    where: { name: "SUPER_ADMIN" },
    update: {},
    create: { name: "SUPER_ADMIN" },
  });

  // 2. ✨ TAMBAHKAN PERMISSIONS (Agar sistem bisa memvalidasi login)
  const permissions = [
    "read_purchase_order",
    "create_purchase_order",
    "update_purchase_order",
    "read_invoice",
    "read_article",
    "read_user",
    "delete_user",
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm },
      update: {},
      create: { name: perm },
    });
  }

  // 3. Hubungkan semua permission ke role SUPER_ADMIN
  const allPermissions = await prisma.permission.findMany();
  await prisma.role.update({
    where: { name: "SUPER_ADMIN" },
    data: {
      permissions: {
        set: allPermissions.map((p) => ({ id: p.id })),
      },
    },
  });

  // 4. Update/Upsert User Super Admin
  const superAdminPassword = "superadmin123";

  const hashedPassword = await argon2.hash(superAdminPassword, {
    type: argon2.argon2id,
  });

  await prisma.user.upsert({
    where: { email: "superadmin@goenakan.id" },
    update: {
      password: hashedPassword,
      role: { connect: { name: "SUPER_ADMIN" } },
    },
    create: {
      name: "Super Admin",
      email: "superadmin@goenakan.id",
      password: hashedPassword,
      role: { connect: { name: "SUPER_ADMIN" } },
    },
  });

  console.log("✅ Permissions synced and Super Admin updated successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const prisma = container.resolve(PrismaService);
    await prisma.$disconnect();
  });
