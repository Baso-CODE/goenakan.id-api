// src/modules/customer-profile/customer-profile.controller.ts
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { CustomerProfileService } from "./customer-profile.service";

@injectable()
export class CustomerProfileController {
  constructor(private readonly profileService: CustomerProfileService) {}

  getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;

      const profile = await this.profileService.getProfileByUserId(userId);

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
