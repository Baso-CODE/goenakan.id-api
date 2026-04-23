// src/modules/customer-profile/customer-profile.service.ts
import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";

import { ApiError } from "../../../utils/api-error";
import {
  CreateCustomerProfileDTO,
  UpdateCustomerProfileDTO,
} from "./dto/customer-profile.dto";

@injectable()
export class CustomerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Ambil Profile berdasarkan User ID
  async getProfileByUserId(userId: string) {
    const profile = await this.prisma.customerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    if (!profile) {
      // Jika profile belum ada, kita buatkan yang default (Individual)
      return this.createProfile({ userId, accountType: "INDIVIDUAL" });
    }

    return profile;
  }

  // 2. Buat Profile Baru
  async createProfile(data: CreateCustomerProfileDTO) {
    return this.prisma.customerProfile.create({
      data: {
        userId: data.userId,
        accountType: data.accountType || "INDIVIDUAL",
        phone: data.phone,
        picName: data.picName,
        picPhone: data.picPhone,
        companyName: data.companyName,
        department: data.department,
        avatarUrl: data.avatarUrl,
      },
    });
  }

  // 3. Update Profile
  // customer-profile.service.ts
  async updateProfile(userId: string, data: UpdateCustomerProfileDTO) {
    const { name, ...profileData } = data;

    // 2. Jalankan transaksi
    return this.prisma.$transaction(async (tx) => {
      if (name) {
        await tx.user.update({
          where: { id: userId },
          data: { name },
        });
      }

      // B. Pastikan profile ada
      const existing = await tx.customerProfile.findUnique({
        where: { userId },
      });

      if (!existing) {
        throw new ApiError("Customer profile not found", 404);
      }
      return tx.customerProfile.update({
        where: { userId },
        data: profileData,
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      });
    });
  }
}
