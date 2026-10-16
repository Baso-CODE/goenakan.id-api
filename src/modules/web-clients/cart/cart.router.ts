import { Router } from "express";
import { injectable } from "tsyringe";
import { PublicAuthMiddleware } from "../../../middleware/publicAuth.middleware";
import { CartController } from "./cart.controller";

@injectable()
export class CartRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly cartController: CartController,
    private readonly publicAuthMiddleware: PublicAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    const auth = this.publicAuthMiddleware.verifyPublicToken;

    this.router.post(
      "/guest-calculate",
      this.cartController.calculateGuestCart,
    );

    this.router.use(auth);

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
