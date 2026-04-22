import { Router } from "express";
import { injectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CustomerAddressController } from "./customer-address.controller";
import { CreateAddressDTO, UpdateAddressDTO } from "./dto/customer-address.dto";

@injectable()
export class CustomerAddressRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly addressController: CustomerAddressController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Ambil fungsi verifikasi token dari middleware kamu
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;

    // Terapkan middleware auth untuk SEMUA endpoint di bawah ini
    // Karena manajemen alamat hanya bisa dilakukan oleh user yang sudah login
    this.router.use(auth);

    // === Endpoint Utama Buku Alamat ===
    // Mengambil semua alamat milik user
    this.router.get("/", this.addressController.getAddresses);

    // Menambah alamat baru (dengan validasi CreateAddressDTO)
    this.router.post(
      "/",
      validateBody(CreateAddressDTO),
      this.addressController.createAddress,
    );

    // === Endpoint Spesifik per Alamat ===
    // Mengambil detail satu alamat
    this.router.get("/:addressId", this.addressController.getAddressById);

    // Mengubah data alamat (dengan validasi UpdateAddressDTO)
    this.router.put(
      "/:addressId",
      validateBody(UpdateAddressDTO),
      this.addressController.updateAddress,
    );

    // Menghapus alamat
    this.router.delete("/:addressId", this.addressController.deleteAddress);

    // === Endpoint Shortcut ===
    // Mengatur sebuah alamat menjadi alamat utama (Default)
    this.router.patch(
      "/:addressId/set-default",
      this.addressController.setDefaultAddress,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
