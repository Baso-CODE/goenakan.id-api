import * as argon2 from "argon2";
import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { CloudinaryService } from "../../cloudinary/cloudinary.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDTO } from "./dto/userManagement.dto";

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
}
