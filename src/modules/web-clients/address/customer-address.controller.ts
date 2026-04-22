import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { CustomerAddressService } from "./customer-address.service";

@injectable()
export class CustomerAddressController {
  constructor(
    private readonly addressService: CustomerAddressService,
    private readonly prisma: PrismaService,
  ) {}

  // === HELPER: Dapatkan Profile ID berdasarkan User Login ===
  private async getProfileId(userId: string): Promise<string> {
    let profile = await this.prisma.customerProfile.findUnique({
      where: { userId },
    });

    // Fallback: Jika user login tapi belum punya profile
    if (!profile) {
      profile = await this.prisma.customerProfile.create({
        data: {
          userId,
          accountType: "INDIVIDUAL",
        },
      });
    }

    return profile.id;
  }

  // === 1. GET ALL ADDRESSES ===
  getAddresses = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id; // Didapat dari Middleware Auth
      const profileId = await this.getProfileId(userId);

      const addresses = await this.addressService.getAddresses(profileId);

      res.status(200).json({ success: true, data: addresses });
    } catch (error) {
      next(error);
    }
  };

  // === 2. GET SINGLE ADDRESS BY ID ===
  getAddressById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profileId = await this.getProfileId(userId);
      const { addressId } = req.params;

      const address = await this.addressService.getAddressById(
        profileId,
        addressId,
      );

      res.status(200).json({ success: true, data: address });
    } catch (error) {
      next(error);
    }
  };

  // === 3. CREATE NEW ADDRESS ===
  createAddress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profileId = await this.getProfileId(userId);

      const result = await this.addressService.createAddress(
        profileId,
        req.body,
      );

      res.status(201).json({
        success: true,
        data: result,
        message: "Alamat berhasil ditambahkan",
      });
    } catch (error) {
      next(error);
    }
  };

  // === 4. UPDATE ADDRESS ===
  updateAddress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profileId = await this.getProfileId(userId);
      const { addressId } = req.params;

      const result = await this.addressService.updateAddress(
        profileId,
        addressId,
        req.body,
      );

      res.status(200).json({
        success: true,
        data: result,
        message: "Alamat berhasil diperbarui",
      });
    } catch (error) {
      next(error);
    }
  };

  // === 5. DELETE ADDRESS ===
  deleteAddress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profileId = await this.getProfileId(userId);
      const { addressId } = req.params;

      await this.addressService.deleteAddress(profileId, addressId);

      res.status(200).json({
        success: true,
        message: "Alamat berhasil dihapus",
      });
    } catch (error) {
      next(error);
    }
  };

  // === 6. SET AS DEFAULT (Shortcut) ===
  setDefaultAddress = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const userId = (req as any).user.id;
      const profileId = await this.getProfileId(userId);
      const { addressId } = req.params;

      const result = await this.addressService.setDefaultAddress(
        profileId,
        addressId,
      );

      res.status(200).json({
        success: true,
        data: result,
        message: "Alamat utama berhasil diubah",
      });
    } catch (error) {
      next(error);
    }
  };
}
