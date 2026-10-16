import { Router } from "express";
import { injectable } from "tsyringe";
import { PublicAuthMiddleware } from "../../../middleware/publicAuth.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CustomerAddressController } from "./customer-address.controller";
import { CreateAddressDTO, UpdateAddressDTO } from "./dto/customer-address.dto";

@injectable()
export class CustomerAddressRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly addressController: CustomerAddressController,
    private readonly publicAuthMiddleware: PublicAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    const auth = this.publicAuthMiddleware.verifyPublicToken;

    this.router.use(auth);

    this.router.get("/", this.addressController.getAddresses);

    this.router.post(
      "/",
      validateBody(CreateAddressDTO),
      this.addressController.createAddress,
    );

    this.router.get("/:addressId", this.addressController.getAddressById);

    this.router.put(
      "/:addressId",
      validateBody(UpdateAddressDTO),
      this.addressController.updateAddress,
    );

    this.router.delete("/:addressId", this.addressController.deleteAddress);

    this.router.patch(
      "/:addressId/set-default",
      this.addressController.setDefaultAddress,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
