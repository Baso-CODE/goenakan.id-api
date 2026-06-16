import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRoleDTO, UpdateRoleDTO } from "./dto/roles.dto";

@injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  // === CREATE ROLE ===
  async createRole(data: CreateRoleDTO) {
    // 1. Format nama role agar konsisten (misal: "SUPER_ADMIN", "STAFF")
    const formattedName = data.name.trim().toUpperCase().replace(/\s+/g, "_");

    // 2. Cek apakah role dengan nama tersebut sudah ada
    const existingRole = await this.prisma.role.findUnique({
      where: { name: formattedName },
    });

    if (existingRole) {
      throw new ApiError(`Role dengan nama "${formattedName}" sudah ada.`, 400);
    }

    // 3. Simpan ke database
    return await this.prisma.role.create({
      data: {
        name: formattedName,
        description: data.description || null,
      },
    });
  }

  // === GET ALL ROLES (WITH PAGINATION) ===
  async getAllRoles(query: { page?: number; take?: number; search?: string }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      if (query.search) {
        where.name = {
          contains: query.search.toUpperCase(),
        };
      }

      const count = await this.prisma.role.count({ where });

      const data = await this.prisma.role.findMany({
        where,
        skip,
        take,
        // Sertakan jumlah user yang menggunakan role ini
        include: {
          _count: {
            select: { users: true },
          },
        },
        orderBy: { name: "asc" },
      });

      const meta = this.pagination.generateMeta({
        count,
        page,
        take,
      });

      return { data, meta };
    } catch (error) {
      console.error("❌ Error in getAllRoles:", error);
      throw new ApiError("Failed to fetch roles from database.", 500);
    }
  }

  // === GET ALL ROLES LIST (Untuk Dropdown tanpa pagination) ===
  async getRolesList() {
    try {
      return await this.prisma.role.findMany({
        select: {
          id: true,
          name: true,
          description: true,
        },
        orderBy: { name: "asc" },
      });
    } catch (error) {
      throw new ApiError("Failed to fetch roles list.", 500);
    }
  }

  // === GET ROLE BY ID ===
  async getRoleById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!role) throw new ApiError("Role tidak ditemukan", 404);
    return role;
  }

  // === UPDATE ROLE ===
  async updateRole(id: string, data: UpdateRoleDTO) {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Role tidak ditemukan", 404);

    // Mencegah perubahan nama pada role krusial (Opsional/Sangat disarankan)
    if (
      existing.name === "SUPER_ADMIN" &&
      data.name &&
      data.name !== "SUPER_ADMIN"
    ) {
      throw new ApiError("Nama role 'SUPER_ADMIN' tidak boleh diubah!", 403);
    }

    let formattedName = existing.name;
    if (data.name) {
      formattedName = data.name.trim().toUpperCase().replace(/\s+/g, "_");

      // Cek apakah nama baru bentrok dengan role lain
      const duplicate = await this.prisma.role.findFirst({
        where: {
          name: formattedName,
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new ApiError(
          `Role dengan nama "${formattedName}" sudah ada.`,
          400,
        );
      }
    }

    return await this.prisma.role.update({
      where: { id },
      data: {
        name: formattedName,
        description: data.description ?? existing.description,
      },
    });
  }

  // === DELETE ROLE ===
  async deleteRole(id: string) {
    const existing = await this.prisma.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!existing) throw new ApiError("Role tidak ditemukan", 404);

    // Mencegah role krusial dihapus
    if (existing.name === "SUPER_ADMIN") {
      throw new ApiError("Role 'SUPER_ADMIN' tidak dapat dihapus!", 403);
    }

    // Mencegah role dihapus jika masih ada user yang menggunakannya
    if (existing._count.users > 0) {
      throw new ApiError(
        `Tidak dapat menghapus role karena masih digunakan oleh ${existing._count.users} user. Silakan ubah role user tersebut terlebih dahulu.`,
        400,
      );
    }

    return await this.prisma.role.delete({
      where: { id },
    });
  }
}
