import countryToCurrency from "country-to-currency";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { CartService } from "./cart.service";

@injectable()
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly prisma: PrismaService,
  ) {}

  private async getProfileId(userId: string): Promise<string> {
    let profile = await this.prisma.customerProfile.findUnique({
      where: { userId },
    });

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

  // ✨ 2. HELPER BARU: Ubah Country menjadi Currency di Backend ✨
  private getTargetCurrency(req: Request): string {
    const countryHeader = req.headers["x-country"]; // Tangkap header x-country

    let targetCurrency = "IDR";

    if (typeof countryHeader === "string" && countryHeader.trim() !== "") {
      const countryCode = countryHeader.toUpperCase();

      if (countryCode === "ID") {
        targetCurrency = "IDR";
      } else {
        const autoCurrency =
          countryToCurrency[countryCode as keyof typeof countryToCurrency];
        targetCurrency = autoCurrency || "USD";
      }
    }

    return targetCurrency;
  }

  // === 1. GET CART ===
  getCart = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profileId = await this.getProfileId(userId);

      // Backend yang menerjemahkan Country -> Currency
      const targetCurrency = this.getTargetCurrency(req);

      const cart = await this.cartService.getCart(profileId, targetCurrency);

      res.status(200).json({ success: true, data: cart });
    } catch (error) {
      next(error);
    }
  };

  // === 2. ADD TO CART ===
  addToCart = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profileId = await this.getProfileId(userId);

      const result = await this.cartService.addToCart(profileId, req.body);

      res.status(201).json({
        success: true,
        data: result,
        message: "Item berhasil ditambahkan ke keranjang",
      });
    } catch (error) {
      next(error);
    }
  };

  // === 3. UPDATE CART ITEM ===
  updateCartItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profileId = await this.getProfileId(userId);
      const { cartItemId } = req.params;

      const result = await this.cartService.updateCartItem(
        profileId,
        cartItemId,
        req.body,
      );

      res.status(200).json({
        success: true,
        data: result,
        message: "Keranjang berhasil diperbarui",
      });
    } catch (error) {
      next(error);
    }
  };

  // === 4. REMOVE FROM CART ===
  removeCartItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profileId = await this.getProfileId(userId);
      const { cartItemId } = req.params;

      await this.cartService.removeCartItem(profileId, cartItemId);

      res
        .status(200)
        .json({ success: true, message: "Item dihapus dari keranjang" });
    } catch (error) {
      next(error);
    }
  };

  // === 5. CLEAR CART ===
  clearCart = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profileId = await this.getProfileId(userId);

      await this.cartService.clearCart(profileId);

      res
        .status(200)
        .json({ success: true, message: "Keranjang telah dikosongkan" });
    } catch (error) {
      next(error);
    }
  };

  // === 6. SYNC GUEST CART ===
  syncGuestCart = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profileId = await this.getProfileId(userId);

      const targetCurrency = this.getTargetCurrency(req);

      const cart = await this.cartService.syncGuestCart(
        profileId,
        req.body,
        targetCurrency,
      );

      res.status(200).json({
        success: true,
        data: cart,
        message: "Keranjang guest berhasil disinkronisasi",
      });
    } catch (error) {
      next(error);
    }
  };
}
