// src/modules/customer-profile/customer-profile.controller.ts
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { CustomerProfileService } from "./customer-profile.service";

@injectable()
export class CustomerProfileController {
  constructor(
    private readonly profileService: CustomerProfileService,
    private readonly prisma: PrismaService,
  ) {}

  private async getOrCreateProfile(userId: string) {
    let profile = await this.prisma.customerProfile.findUnique({
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
      profile = await this.prisma.customerProfile.create({
        data: {
          userId,
          accountType: "INDIVIDUAL",
        },
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
    }

    return profile;
  }

  getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;

      const profile = await this.getOrCreateProfile(userId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  };

  // === 2. UPDATE MY PROFILE ===
  updateMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;

      await this.getOrCreateProfile(userId);

      const result = await this.profileService.updateProfile(userId, req.body);

      res.status(200).json({
        success: true,
        data: result,
        message: "Profil berhasil diperbarui",
      });
    } catch (error) {
      next(error);
    }
  };
}
