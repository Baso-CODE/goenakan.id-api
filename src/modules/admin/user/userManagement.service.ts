import * as argon2 from "argon2";
import { injectable } from "tsyringe";

import { Prisma } from "@prisma/client";
import { ApiError } from "../../../utils/api-error";
import { CloudinaryService } from "../../cloudinary/cloudinary.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDTO, UpdateUserDTO } from "./dto/userManagement.dto";

@injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // === CREATE USER BY SUPER ADMIN ===
  async createUser(data: CreateUserDTO, file?: Express.Multer.File) {
    // 1. Cek apakah email sudah terdaftar
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ApiError("Email ini sudah terdaftar di sistem", 400);
    }

    // 2. Cek apakah Role ID yang dikirim valid/ada di database
    const roleExists = await this.prisma.role.findUnique({
      where: { id: data.roleId },
    });

    if (!roleExists) {
      throw new ApiError("Role tidak ditemukan", 404);
    }

    // 3. Logika Upload Gambar ke Cloudinary
    let imageUrl: string | null = null;

    if (file) {
      try {
        const uploadResult = await this.cloudinary.upload(file, {
          folder: "user-profiles",
          resource_type: "image",
        });
        imageUrl = uploadResult.secure_url;
      } catch (error) {
        throw new ApiError("Gagal mengunggah foto profil", 500);
      }
    }

    // 4. Hash Password menggunakan Argon2
    const hashedPassword = await argon2.hash(data.password);

    // 5. Simpan ke database
    const newUser = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        roleId: data.roleId,
        image: imageUrl,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            permissions: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return newUser;
  }

  // === GET ALL USERS (Dilengkapi Role & Permissions) ===
  async getAllUsers() {
    return await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        image: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            permissions: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async getAllAuthors() {
    return await this.prisma.user.findMany({
      where: {
        role: {
          name: {
            not: "CUSTOMER",
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
    });
  }

  // === UPDATE USER BY SUPER ADMIN ===
  async updateUser(
    id: string,
    data: UpdateUserDTO,
    file?: Express.Multer.File,
  ) {
    // ==========================================
    // 1. VALIDASI USER
    // ==========================================

    const existingUser = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        image: true,
      },
    });

    if (!existingUser) {
      throw new ApiError("User tidak ditemukan", 404);
    }

    // ==========================================
    // 2. PREPARE UPDATE DATA
    // ==========================================

    const updateData: Prisma.UserUpdateInput = {};

    // ==========================================
    // 3. UPDATE NAME
    // ==========================================

    if (data.name !== undefined) {
      if (typeof data.name !== "string" || !data.name.trim()) {
        throw new ApiError("Nama user tidak boleh kosong", 400);
      }

      updateData.name = data.name.trim();
    }

    // ==========================================
    // 4. UPDATE EMAIL
    // ==========================================

    if (data.email !== undefined) {
      if (typeof data.email !== "string") {
        throw new ApiError("Email tidak valid", 400);
      }

      const normalizedEmail = data.email.trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new ApiError("Format email tidak valid", 400);
      }

      if (normalizedEmail !== existingUser.email) {
        const emailExists = await this.prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        });

        if (emailExists && emailExists.id !== id) {
          throw new ApiError("Email ini sudah digunakan user lain", 400);
        }
      }

      updateData.email = normalizedEmail;
    }

    // ==========================================
    // 5. UPDATE PASSWORD
    // ==========================================

    if (data.password !== undefined) {
      if (typeof data.password !== "string" || data.password.length < 8) {
        throw new ApiError("Password minimal 8 karakter", 400);
      }

      updateData.password = await argon2.hash(data.password);
    }

    // ==========================================
    // 6. UPDATE ROLE
    // ==========================================

    if (data.roleId !== undefined) {
      if (typeof data.roleId !== "string" || !data.roleId.trim()) {
        throw new ApiError("Role ID tidak valid", 400);
      }

      const role = await this.prisma.role.findUnique({
        where: {
          id: data.roleId.trim(),
        },
        select: {
          id: true,
        },
      });

      if (!role) {
        throw new ApiError("Role tidak ditemukan", 404);
      }

      updateData.role = {
        connect: {
          id: role.id,
        },
      };
    }

    // ==========================================
    // 7. UPLOAD NEW PROFILE IMAGE
    // ==========================================

    if (file) {
      if (!file.mimetype.startsWith("image/")) {
        throw new ApiError("File harus berupa gambar", 400);
      }

      const maxFileSize = 5 * 1024 * 1024;

      if (file.size > maxFileSize) {
        throw new ApiError("Ukuran gambar maksimal 5MB", 400);
      }

      try {
        const uploadResult = await this.cloudinary.upload(file, {
          folder: "user-profiles",
          resource_type: "image",
        });

        updateData.image = uploadResult.secure_url;
      } catch {
        throw new ApiError("Gagal mengunggah foto profil", 500);
      }
    }

    // ==========================================
    // 8. UPDATE DATABASE
    // ==========================================

    try {
      const updatedUser = await this.prisma.user.update({
        where: {
          id,
        },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              permissions: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      return updatedUser;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ApiError("Email ini sudah digunakan user lain", 409);
      }

      throw error;
    }
  }

  // ==========================================
  // GET USER BY ID
  // ==========================================
  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        roleId: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    if (!user) {
      throw new ApiError("User tidak ditemukan", 404);
    }

    return user;
  }
}
