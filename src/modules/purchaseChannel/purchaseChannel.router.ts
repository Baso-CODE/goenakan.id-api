import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { PurchaseChannelController } from "./purchaseChannel.controller";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";

import { CreatePurchaseChannelDTO } from "./dto/createPurchaseChannel.dto";
import { UpdatePurchaseChannelDTO } from "./dto/udpatepurchaseChannel.dto";

@autoInjectable()
export class PurchaseChannelRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly purchaseChannelController: PurchaseChannelController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // === GET ALL WITH PAGINATION ===
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.purchaseChannelController.getAllPurchaseChannels,
    );

    // === LIST FOR DROPDOWN ===
    this.router.get(
      "/list",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.purchaseChannelController.getPurchaseChannelList,
    );

    // === GET BY ID ===
    this.router.get(
      "/:slug",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.purchaseChannelController.getPurchaseChannelBySlug,
    );

    // === CREATE ===
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreatePurchaseChannelDTO),
      this.purchaseChannelController.createPurchaseChannel,
    );

    // === UPDATE ===
    this.router.patch(
      "/:slug",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdatePurchaseChannelDTO),
      this.purchaseChannelController.updatePurchaseChannel,
    );

    // === DELETE ===
    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.purchaseChannelController.deletePurchaseChannel,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
