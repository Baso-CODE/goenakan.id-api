import { PERMISSION_ACTIONS, PERMISSION_MODULES } from "../config/permissions";
import { PrismaService } from "../modules/prisma/prisma.service";

export async function syncPermissionsToDatabase(
  prisma: PrismaService,
): Promise<void> {
  try {
    // console.log("🔄 Synchronizing admin permissions...");

    const activePermissionNames = PERMISSION_MODULES.flatMap((module) =>
      PERMISSION_ACTIONS.map((action) => `${action}_${module}`),
    );

    await prisma.$transaction(
      activePermissionNames.map((name) =>
        prisma.permission.upsert({
          where: { name },
          update: {},
          create: {
            name,
            description: createPermissionDescription(name),
          },
        }),
      ),
    );

    // console.log(`✅ ${activePermissionNames.length} permissions synchronized.`);
  } catch (error) {
    console.error("❌ Failed to synchronize permissions:", error);
    throw error;
  }
}

function createPermissionDescription(name: string): string {
  const [action, ...moduleParts] = name.split("_");
  const moduleName = moduleParts.join(" ");

  return `Allows admin to ${action} ${moduleName}`;
}
