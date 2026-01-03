import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { env } from "../../../config";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CreateVendorItemDTO } from "./dto/createItemVendor.dto";
import { UpdateVendorItemDTO } from "./dto/updateItemVendor.dto";
import { ItemVendorController } from "./itemVendor.controller";

@autoInjectable()
export class ItemVendorRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly itemVendorController: ItemVendorController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // === PUBLIC ROUTE: Get All Active Items ===
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.itemVendorController.getAllItems,
    );

    // === PROTECTED ROUTES ===
    this.router.get(
      "/active",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.itemVendorController.getActiveItems,
    );

    // === PROTECTED ROUTES ===
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.itemVendorController.getItemById,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateVendorItemDTO),
      this.itemVendorController.createItem,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateVendorItemDTO),
      this.itemVendorController.updateItem,
    );

    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.itemVendorController.deleteItem,
    );

    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.itemVendorController.exportItems,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
