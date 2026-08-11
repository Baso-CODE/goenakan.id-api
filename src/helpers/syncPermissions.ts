// src/helpers/syncPermissions.ts
import fs from "fs";
import path from "path";
import { PrismaService } from "../modules/prisma/prisma.service";

const ACTIONS = ["read", "create", "update", "delete"] as const;

// Daftar nama folder teknis internal yang TIDAK boleh didaftarkan sebagai permission
const IGNORED_FOLDERS = [
  "dto",
  "service",
  "controller",
  "repository",
  "entities",
  "interfaces",
];

function getDirectoriesRecursive(dirPath: string): string[] {
  let results: string[] = [];
  try {
    const list = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const file of list) {
      if (file.isDirectory()) {
        const dirName = file.name;

        // ✨ Jika folder adalah bagian dari teknis internal, abaikan dan jangan masuk ke list permission
        if (IGNORED_FOLDERS.includes(dirName)) {
          continue;
        }

        results.push(dirName);
        const res = getDirectoriesRecursive(path.join(dirPath, dirName));
        results = results.concat(res);
      }
    }
  } catch (error) {
    console.error(`Gagal membaca direktori ${dirPath}:`, error);
  }
  return results;
}

export async function syncPermissionsToDatabase(prisma: PrismaService) {
  try {
    console.log(
      "🔍 Memindai folder utama admin (mengabaikan folder teknis seperti DTO)...",
    );

    const adminDir = path.join(process.cwd(), "src", "modules", "admin");

    if (!fs.existsSync(adminDir)) {
      console.warn("⚠️ Folder src/modules/admin tidak ditemukan!");
      return;
    }

    const allFolders = getDirectoriesRecursive(adminDir);
    const uniqueModules = Array.from(new Set(allFolders));

    const activePermissionNames: string[] = [];

    for (const mod of uniqueModules) {
      for (const action of ACTIONS) {
        const formattedModName = mod.replace(/-/g, "_");
        const permissionName = `${action}_${formattedModName}`;

        activePermissionNames.push(permissionName);

        await prisma.permission.upsert({
          where: { name: permissionName },
          update: {},
          create: {
            name: permissionName,
            description: `Allows admin to ${action} ${formattedModName.replace(/_/g, " ")}`,
          },
        });
      }
    }

    // Bersihkan permission lama termasuk 'dto' yang terlanjur masuk
    const obsoletePermissions = await prisma.permission.findMany({
      where: {
        name: {
          notIn: activePermissionNames,
        },
      },
      select: { id: true },
    });

    const obsoleteIds = obsoletePermissions.map((p) => p.id);

    if (obsoleteIds.length > 0) {
      for (const permId of obsoleteIds) {
        await prisma.permission.update({
          where: { id: permId },
          data: {
            roles: {
              set: [],
            },
          },
        });
      }

      await prisma.permission.deleteMany({
        where: {
          id: {
            in: obsoleteIds,
          },
        },
      });
      console.log(
        `🗑️ Berhasil membersihkan ${obsoleteIds.length} permission teknis/lama dari database.`,
      );
    }

    console.log("✅ Auto-sync permissions admin kini bersih dari folder DTO!");
  } catch (error) {
    console.error("❌ Gagal melakukan auto-sync permissions:", error);
  }
}
