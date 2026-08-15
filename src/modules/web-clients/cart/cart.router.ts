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
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;

    this.router.post(
      "/guest-calculate",
      this.cartController.calculateGuestCart,
    );

    this.router.use(auth);

    // === RUTE PRIVATE (HANYA UNTUK USER LOGIN) ===
    this.router.get("/", this.cartController.getCart);
    this.router.post("/", this.cartController.addToCart);

    this.router.post("/sync", this.cartController.syncGuestCart);

    this.router.patch("/:cartItemId", this.cartController.updateCartItem);
    this.router.delete("/:cartItemId", this.cartController.removeCartItem);

    this.router.delete("/all/clear", this.cartController.clearCart);
  };

  getRouter(): Router {
    return this.router;
  }
}
