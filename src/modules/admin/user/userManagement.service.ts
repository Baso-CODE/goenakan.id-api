import * as argon2 from "argon2";
import { injectable } from "tsyringe";

import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { ApiError } from "../../../utils/api-error";
import { CloudinaryService } from "../../cloudinary/cloudinary.service";
import { PrismaService } from "../../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { CreateUserDTO, UpdateUserDTO } from "./dto/userManagement.dto";

@injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async createUser(data: CreateUserDTO, file?: Express.Multer.File) {
    const email = data.email.trim().toLowerCase();
    const name = data.name.trim();

    if (!name) {
      throw new ApiError("Nama pengguna wajib diisi.", 400);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ApiError(
        "Email sudah terdaftar. Jangan membuat akun baru. Gunakan fitur kirim ulang undangan bila diperlukan.",
        409,
      );
    }

    const role = await this.prisma.role.findUnique({
      where: { id: data.roleId },
    });

    if (!role) {
      throw new ApiError("Role tidak ditemukan.", 404);
    }

    if (role.name === "CUSTOMER") {
      throw new ApiError(
        "Role CUSTOMER tidak dapat dibuat melalui Admin.",
        400,
      );
    }

    const baseUrl = process.env.ADMIN_PANEL_URL;

    if (!baseUrl) {
      throw new ApiError(
        "ADMIN_PANEL_URL belum dikonfigurasi di Backend.",
        500,
      );
    }

    const adminUrl = new URL(baseUrl);

    if (
      process.env.NODE_ENV === "production" &&
      adminUrl.protocol !== "https:"
    ) {
      throw new ApiError(
        "ADMIN_PANEL_URL production wajib menggunakan HTTPS.",
        500,
      );
    }

    // Password acak, tidak diketahui Super Admin.
    const randomPassword = randomBytes(48).toString("hex");
    const hashedPassword = await argon2.hash(randomPassword);

    // Token sekali pakai.
    const activationToken = randomBytes(32).toString("hex");
    const activationTokenHash = createHash("sha256")
      .update(activationToken)
      .digest("hex");

    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const activationUrl = new URL("/activate-account", adminUrl);

    activationUrl.searchParams.set("token", activationToken);

    let imageUrl: string | null = null;

    if (file) {
      try {
        const uploaded = await this.cloudinary.upload(file, {
          folder: "user-profiles",
          resource_type: "image",
        });

        imageUrl = uploaded.secure_url;
      } catch (error) {
        console.error("Upload foto user gagal:", error);

        throw new ApiError("Gagal mengunggah foto profil.", 500);
      }
    }

    const newUser = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        roleId: role.id,
        image: imageUrl,
        verificationToken: activationTokenHash,
        tokenExpiresAt,
        emailVerified: null,
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

    // Akun sudah tersimpan, pengiriman email dilakukan
    // sesudahnya agar error SMTP tidak membuat akun ganda.
    let invitationEmailSent = false;

    try {
      const mailService = new MailService();

      await mailService.sendAdminInvitationEmail(email, {
        name,
        role: role.name,
        activationUrl: activationUrl.toString(),
      });

      invitationEmailSent = true;
    } catch (error) {
      console.error("[USER INVITATION] Gagal mengirim email:", error);
    }

    return {
      ...newUser,
      invitationEmailSent,
      invitationMessage: invitationEmailSent
        ? "Akun berhasil dibuat dan email undangan dikirim."
        : "Akun berhasil dibuat, tetapi email gagal dikirim. Gunakan fitur Kirim Ulang Undangan.",
    };
  }

  // ============================================================
  // AKTIVASI AKUN ADMIN - PUBLIC, TOKEN SEKALI PAKAI
  // ============================================================
  async activateAdminAccount(token: string, newPassword: string) {
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      throw new ApiError("Link aktivasi tidak valid.", 400);
    }

    if (newPassword.length < 12 || newPassword.length > 128) {
      throw new ApiError(
        "Password harus terdiri dari 12 sampai 128 karakter.",
        400,
      );
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const now = new Date();

    const user = await this.prisma.user.findFirst({
      where: {
        verificationToken: tokenHash,
        tokenExpiresAt: { gt: now },
        emailVerified: null,
        role: {
          name: { not: "CUSTOMER" },
        },
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new ApiError(
        "Link aktivasi tidak valid, sudah digunakan, atau kedaluwarsa.",
        400,
      );
    }

    const hashedPassword = await argon2.hash(newPassword);

    // Atomic update: dua request tidak dapat memakai
    // token yang sama untuk aktivasi dua kali.
    const result = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        verificationToken: tokenHash,
        tokenExpiresAt: { gt: new Date() },
        emailVerified: null,
      },
      data: {
        password: hashedPassword,
        emailVerified: new Date(),
        verificationToken: null,
        tokenExpiresAt: null,
      },
    });

    if (result.count !== 1) {
      throw new ApiError("Link aktivasi sudah tidak berlaku.", 400);
    }

    return {
      message:
        "Akun berhasil diaktifkan. Silakan login menggunakan password baru.",
    };
  }

  // ============================================================
  // KIRIM ULANG UNDANGAN - HANYA SUPER ADMIN VIA ROUTER
  // ============================================================
  async resendAdminInvitation(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: { select: { name: true } },
      },
    });

    if (!user) {
      throw new ApiError("User tidak ditemukan.", 404);
    }

    if (
      user.role.name === "CUSTOMER" ||
      user.emailVerified ||
      !user.verificationToken
    ) {
      throw new ApiError(
        "User ini tidak memiliki undangan aktivasi yang tertunda.",
        400,
      );
    }

    const baseUrl = process.env.ADMIN_PANEL_URL;

    if (!baseUrl) {
      throw new ApiError("ADMIN_PANEL_URL belum dikonfigurasi.", 500);
    }

    const adminUrl = new URL(baseUrl);

    if (
      process.env.NODE_ENV === "production" &&
      adminUrl.protocol !== "https:"
    ) {
      throw new ApiError(
        "ADMIN_PANEL_URL production wajib menggunakan HTTPS.",
        500,
      );
    }

    const token = randomBytes(32).toString("hex");

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const activationUrl = new URL("/activate-account", adminUrl);

    activationUrl.searchParams.set("token", token);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: tokenHash,
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    try {
      await new MailService().sendAdminInvitationEmail(user.email, {
        name: user.name || "Pengguna",
        role: user.role.name,
        activationUrl: activationUrl.toString(),
      });
    } catch (error) {
      console.error("Gagal kirim ulang undangan:", error);

      throw new ApiError(
        "Email undangan gagal dikirim. Akun tetap tersimpan. Periksa konfigurasi SMTP lalu coba kirim ulang.",
        502,
      );
    }

    return {
      message: "Email undangan berhasil dikirim ulang.",
      invitationEmailSent: true,
    };
  }

  // === GET ALL USERS (Dilengkapi Role & Permissions) ===

  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        image: true,

        // Hanya digunakan di backend untuk menentukan status.
        emailVerified: true,
        verificationToken: true,

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

    return users.map(({ emailVerified, verificationToken, ...user }) => ({
      ...user,

      invitationPending: Boolean(
        !emailVerified && verificationToken && user.role.name !== "CUSTOMER",
      ),
    }));
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
