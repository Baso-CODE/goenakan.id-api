import { Router } from "express";
import { injectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { CartController } from "./cart.controller";

@injectable()
export class CartRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly cartController: CartController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Ambil fungsi verifikasi token dari middleware kamu
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;

    // Terapkan middleware auth untuk SEMUA endpoint di bawah ini
    // Karena keranjang di database hanya untuk user yang sudah login
    this.router.use(auth);

    // === Endpoint Utama Keranjang ===
    this.router.get("/", this.cartController.getCart);
    this.router.post("/", this.cartController.addToCart);

    // === Endpoint Sinkronisasi (Guest ke User) ===
    this.router.post("/sync", this.cartController.syncGuestCart);

    // === Endpoint Spesifik per Item ===
    this.router.patch("/:cartItemId", this.cartController.updateCartItem);
    this.router.delete("/:cartItemId", this.cartController.removeCartItem);

    // === Endpoint Hapus Semua (Setelah Checkout) ===
    // Path dibuat "/all/clear" agar tidak bentrok dengan parameter "/:cartItemId"
    this.router.delete("/all/clear", this.cartController.clearCart);
  };

  getRouter(): Router {
    return this.router;
  }
}
