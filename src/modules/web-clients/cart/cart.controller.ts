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

  // === HELPER: Dapatkan Profile ID berdasarkan User Login ===
  private async getProfileId(userId: string): Promise<string> {
    let profile = await this.prisma.customerProfile.findUnique({
      where: { userId },
    });

    // Fallback: Jika user login tapi belum punya profile (misal via Google Auth)
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

  // === 1. GET CART ===
  getCart = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id; // Didapat dari Middleware Auth
      const profileId = await this.getProfileId(userId);

      const cart = await this.cartService.getCart(profileId);

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

  // === 3. UPDATE CART ITEM (Quantity / Notes) ===
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

  // === 5. CLEAR CART (Setelah Checkout) ===
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

  // === 6. SYNC GUEST CART (Saat user login) ===
  syncGuestCart = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profileId = await this.getProfileId(userId);

      const cart = await this.cartService.syncGuestCart(profileId, req.body);

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
