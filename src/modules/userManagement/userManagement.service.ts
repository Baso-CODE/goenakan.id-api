import * as argon2 from "argon2";
import { injectable } from "tsyringe";

import { ApiError } from "../../utils/api-error";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDTO } from "./dto/userManagement.dto";

@injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService, // ✨ Inject Cloudinary Service
  ) {}

  // === CREATE USER BY SUPER ADMIN ===
  // ✨ Tambahkan parameter file (opsional)
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

    // 3. ✨ LOGIKA UPLOAD GAMBAR KE CLOUDINARY
    let imageUrl: string | null = null;

    if (file) {
      try {
        const uploadResult = await this.cloudinary.upload(file, {
          folder: "user-profiles", // Rapikan di folder khusus user
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
        image: imageUrl, // ✨ Gunakan URL dari Cloudinary (atau null jika tidak ada file)
      },
      // 6. Kembalikan data user tanpa menyertakan field password!
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
          },
        },
      },
    });

    return newUser;
  }

  // === GET ALL USERS (Opsional, untuk ditampilkan di tabel Admin) ===
  async getAllUsers() {
    return await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        image: true, // ✨ Tambahkan image agar tampil di list
        role: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }
}
