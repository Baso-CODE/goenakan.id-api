import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import {
  CreateShipmentNoteCategoryDTO,
  UpdateShipmentNoteCategoryDTO,
} from "./dto/shipment-note.dto";
import { ShipmentNoteCategoryController } from "./notesShipmentCategory.controller";

@autoInjectable()
export class ShipmentNoteCategoryRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly shipmentNoteCategoryController: ShipmentNoteCategoryController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.shipmentNoteCategoryController.getAll,
    );

    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.shipmentNoteCategoryController.getOne,
    );

    // Create
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateShipmentNoteCategoryDTO),
      this.shipmentNoteCategoryController.create,
    );

    // Update
    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateShipmentNoteCategoryDTO),
      this.shipmentNoteCategoryController.update,
    );

    // Delete
    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.shipmentNoteCategoryController.delete,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
