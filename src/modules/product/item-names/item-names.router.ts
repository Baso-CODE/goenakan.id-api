import { Router } from "express";
import { autoInjectable } from "tsyringe";

// Import middleware dan controller terkait
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CreateItemNameDTO, UpdateItemNameDTO } from "./dto/item-names.dto";
import { ItemNameController } from "./item-names.controller";

@autoInjectable()
export class ItemNameRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly itemNameController: ItemNameController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Definisi middleware autentikasi dan role (hanya Super Admin)
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;
    const adminRole = verifyRole(["SUPER_ADMIN"]);

    // === ROUTES: Item Name Management ===

    // 1. Ambil semua item name (Pagination, Search, & Filter by Category)
    this.router.get(
      "/",
      auth,
      adminRole,
      this.itemNameController.getAllItemNames,
    );

    // 2. Ekspor data item name ke Excel
    this.router.get(
      "/export/excel",
      auth,
      adminRole,
      this.itemNameController.exportItemNames,
    );

    // 3. Ambil detail item name berdasarkan ID
    this.router.get(
      "/:id",
      auth,
      adminRole,
      this.itemNameController.getItemNameById,
    );

    // 4. Buat Item Name baru
    this.router.post(
      "/",
      auth,
      adminRole,
      validateBody(CreateItemNameDTO),
      this.itemNameController.createItemName,
    );

    // 5. Perbarui data Item Name
    this.router.patch(
      "/:id",
      auth,
      adminRole,
      validateBody(UpdateItemNameDTO),
      this.itemNameController.updateItemName,
    );

    // 6. Hapus Item Name
    this.router.delete(
      "/:id",
      auth,
      adminRole,
      this.itemNameController.deleteItemName,
    );
  };

  /**
   * Mengembalikan instance router untuk didaftarkan di aplikasi utama
   */
  getRouter(): Router {
    return this.router;
  }
}
