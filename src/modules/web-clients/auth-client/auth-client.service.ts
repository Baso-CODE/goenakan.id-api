import * as argon2 from "argon2";
import crypto from "crypto";
import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { RegisterUserDTO } from "./dto/register-user.dto";
import { EmailService } from "./email.service";

@injectable()
export class AuthServiceWebClient {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // ✨ Tambahkan parameter 'lang' dengan nilai default 'id' (Indonesia)
  async registerCustomer(data: RegisterUserDTO, lang: "id" | "en" = "id") {
    // 1. Tentukan nama dan nomor HP utama sejak awal untuk keperluan pengecekan
    const primaryName =
      data.accountType === "INDIVIDUAL" ? data.fullName! : data.picName!;
    const primaryPhone =
      data.accountType === "INDIVIDUAL" ? data.phone! : data.picNumbers!;

    // 2. Siapkan kamus pesan error dua bahasa
    const errorMessages = {
      id: {
        emailTaken:
          "Email sudah terdaftar. Silakan gunakan email lain atau login.",
        phoneTaken:
          "Nomor telepon sudah terdaftar. Silakan gunakan nomor lain.",
      },
      en: {
        emailTaken:
          "This email is already registered. Please use another email or login.",
        phoneTaken:
          "This phone number is already registered. Please use another phone number.",
      },
    };
    const messages = errorMessages[lang] || errorMessages["id"];

    // 3. Cek apakah email ATAU nomor telepon sudah terdaftar
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { phone: primaryPhone }],
      },
    });

    // Jika ditemukan data yang kembar, tampilkan error sesuai bahasa
    if (existingUser) {
      if (existingUser.email === data.email) {
        throw new Error(messages.emailTaken);
      }
      if (existingUser.phone === primaryPhone) {
        throw new Error(messages.phoneTaken);
      }
    }

    // 4. Hash Password menggunakan Argon2
    const hashedPassword = await argon2.hash(data.password);

    // 5. Buat Token Verifikasi (Acak 64 karakter) & Batas Waktu (24 jam)
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 24);

    // 6. Jalankan Prisma Transaction (Atomicity)
    const result = await this.prisma.$transaction(async (tx) => {
      // A. Buat Akun User (Tabel Inti)
      const newUser = await tx.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          name: primaryName,
          phone: primaryPhone, // ✨ PENTING: Simpan nomor HP ke tabel User agar @unique berfungsi
          verificationToken: verificationToken,
          tokenExpiresAt: tokenExpiresAt,
          role: {
            connect: { name: "CUSTOMER" },
          },
        },
      });

      // B. Buat Customer Profile
      const newProfile = await tx.customerProfile.create({
        data: {
          userId: newUser.id,
          accountType: data.accountType,
          phone: data.accountType === "INDIVIDUAL" ? data.phone : null,
          picName: data.accountType === "CORPORATE" ? data.picName : null,
          picPhone: data.accountType === "CORPORATE" ? data.picNumbers : null,
          companyName:
            data.accountType === "CORPORATE" ? data.companyName : null,
          department: data.accountType === "CORPORATE" ? data.department : null,
        },
      });

      // C. Buat Alamat Default menggunakan input 'address'
      await tx.customerAddress.create({
        data: {
          profileId: newProfile.id,
          label: "Alamat Utama",
          recipient: primaryName,
          phone: primaryPhone,
          fullAddress: data.address,
          isDefault: true,
        },
      });

      // D. Buat Keranjang Kosong untuk user ini
      await tx.cart.create({
        data: { profileId: newProfile.id },
      });

      return newUser;
    });

    // 7. Kirim Email Verifikasi
    try {
      await this.emailService.sendVerificationEmail(
        result.email,
        verificationToken,
      );
    } catch (emailError) {
      console.error("❌ Gagal mengirim email verifikasi:", emailError);
    }

    // 8. Keamanan: Hapus password dari objek sebelum dikembalikan ke Frontend
    const { password, ...safeUser } = result;
    return safeUser;
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error(
        "Jika email terdaftar, tautan reset password telah dikirim.",
      );
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const passwordResetExpires = new Date(Date.now() + 3600000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: resetToken,
        tokenExpiresAt: passwordResetExpires,
      },
    });

    await this.emailService.sendPasswordResetEmail(user.email, resetToken);

    return { message: "Tautan reset password telah dikirim ke email Anda." };
  }

  // === 3. EKSEKUSI RESET PASSWORD BARU ===
  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        verificationToken: token,
        tokenExpiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new Error(
        "Token reset password tidak valid atau sudah kedaluwarsa.",
      );
    }

    const hashedPassword = await argon2.hash(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        verificationToken: null,
        tokenExpiresAt: null,
      },
    });

    return {
      message: "Kata sandi berhasil diperbarui. Silakan login kembali.",
    };
  }
}
