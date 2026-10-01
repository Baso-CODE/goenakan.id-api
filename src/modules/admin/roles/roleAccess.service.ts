import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { PrismaService } from "../../prisma/prisma.service";

@injectable()
export class RoleAccessService {
  constructor(private readonly prisma: PrismaService) {}
  // ==========================================
  // 1. MEMBERIKAN / MENETAPKAN PERMISSIONS KE SEBUAH ROLE
  // ==========================================
  async assignPermissionsToRole(roleId: string, permissionIds: string[]) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: {
        id: true,
        permissionVersion: true,
      },
    });

    if (!role) {
      throw new ApiError("Role tidak ditemukan", 404);
    }

    const updatedRole = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        permissions: {
          set: permissionIds.map((id) => ({ id })),
        },
        permissionVersion: {
          increment: 1,
        },
      },
      include: {
        permissions: true,
      },
    });

    return {
      message: "Hak akses (permissions) untuk role berhasil diperbarui",
      data: updatedRole,
    };
  }

  // ==========================================
  // 2. MENDAPATKAN SEMUA PERMISSIONS YANG DIMILIKI SEBUAH ROLE
  // ==========================================
  async getPermissionsByRole(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: true,
      },
    });

    if (!role) {
      throw new ApiError("Role tidak ditemukan", 404);
    }

    return role.permissions;
  }

  // Tambahkan fungsi ini di dalam class RoleService-mu
  async getAllPermissionsList() {
    return await this.prisma.permission.findMany({
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: {
        name: "asc",
      },
    });
  }
}
