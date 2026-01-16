import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CreateVendorDTO } from "./dto/createVendor.dto";
import { UpdateVendorDTO } from "./dto/updateVendor.dto";
import { VendorController } from "./vendor.controller";

@autoInjectable()
export class VendorRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly vendorController: VendorController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get("/", this.vendorController.getAllVendors);

    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.vendorController.exportVendors,
    );

    // Order Add (Pindahkan ke atas)
    this.router.get(
      "/order/add",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.vendorController.getAllVendorsForOrder,
    );

    this.router.get(
      "/by-order/:orderId",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.vendorController.getVendorsByOrder,
    );

    this.router.get(
      "/detail/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.vendorController.getVendorByIdDetail,
    );

    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.vendorController.getVendorById,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateVendorDTO),
      this.vendorController.createVendor,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateVendorDTO),
      this.vendorController.updateVendor,
    );

    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.vendorController.deleteVendor,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
