import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { PurchaseChannelController } from "./purchaseChannel.controller";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
//  Import autoVerifyPermission dan hapus verifyRole
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
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
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang middleware pelindung di sini satu kali saja.
    // Semua route di bawahnya akan otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission("purchase_channel"));

    // ==========================================
    // GET ALL WITH PAGINATION (Otomatis butuh 'read_purchase_channels')
    // ==========================================
    this.router.get("/", this.purchaseChannelController.getAllPurchaseChannels);

    // ==========================================
    // LIST FOR DROPDOWN (Otomatis butuh 'read_purchase_channels')
    // ==========================================
    this.router.get(
      "/list",
      this.purchaseChannelController.getPurchaseChannelList,
    );

    // ==========================================
    // GET BY ID (Otomatis butuh 'read_purchase_channels')
    // ==========================================
    this.router.get(
      "/:slug",
      this.purchaseChannelController.getPurchaseChannelBySlug,
    );

    // ==========================================
    // CREATE (Otomatis butuh 'create_purchase_channels')
    // ==========================================
    this.router.post(
      "/",
      validateBody(CreatePurchaseChannelDTO),
      this.purchaseChannelController.createPurchaseChannel,
    );

    // ==========================================
    // UPDATE (Otomatis butuh 'update_purchase_channels')
    // ==========================================
    this.router.patch(
      "/:slug",
      validateBody(UpdatePurchaseChannelDTO),
      this.purchaseChannelController.updatePurchaseChannel,
    );

    // ==========================================
    // DELETE (Otomatis butuh 'delete_purchase_channels')
    // ==========================================
    this.router.delete(
      "/:id",
      this.purchaseChannelController.deletePurchaseChannel,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
