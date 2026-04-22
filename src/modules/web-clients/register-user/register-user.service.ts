import { Role } from "@prisma/client";
import * as argon2 from "argon2";
import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { RegisterUserDTO } from "./dto/register-user.dto";

@injectable()
export class AuthServiceWebClient {
  constructor(private readonly prisma: PrismaService) {}

  async registerCustomer(data: RegisterUserDTO) {
    // 1. Cek apakah email sudah terdaftar
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new Error(
        "Email sudah terdaftar. Silakan gunakan email lain atau login.",
      );
    }

    // 2. Hash Password menggunakan Argon2
    const hashedPassword = await argon2.hash(data.password);

    // 3. Tentukan nama dan nomor HP utama untuk keperluan Address
    const primaryName =
      data.accountType === "INDIVIDUAL" ? data.fullName! : data.picName!;
    const primaryPhone =
      data.accountType === "INDIVIDUAL" ? data.phone! : data.picNumbers!;

    // 4. Jalankan Prisma Transaction (Atomicity)
    // Jika pembuatan alamat gagal, pembuatan user juga akan dibatalkan otomatis
    const result = await this.prisma.$transaction(async (tx) => {
      // A. Buat Akun User (Tabel Inti)
      const newUser = await tx.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          name: primaryName, // Menggunakan fullName atau picName
          role: Role.CUSTOMER, // Otomatis dijadikan CUSTOMER
        },
      });

      // B. Buat Customer Profile
      const newProfile = await tx.customerProfile.create({
        data: {
          userId: newUser.id,
          accountType: data.accountType,

          // Data Individual (Jika corporate, ini akan bernilai undefined/null)
          phone: data.accountType === "INDIVIDUAL" ? data.phone : null,

          // Data Corporate
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

      // D. Buat Keranjang Kosong untuk user ini (Opsional, tapi bagus agar siap pakai)
      await tx.cart.create({
        data: { profileId: newProfile.id },
      });

      return newUser;
    });

    // 5. Keamanan: Hapus password dari objek sebelum dikembalikan ke Frontend
    const { password, ...safeUser } = result;
    return safeUser;
  }
}
