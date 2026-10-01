import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
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
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission("item_name"));

    // ==========================================
    // === ROUTES: Item Name Management ===
    // ==========================================

    // 1. Ambil semua item name (Pagination, Search, & Filter) -> Otomatis butuh 'read'
    this.router.get("/", this.itemNameController.getAllItemNames);

    // 2. Ekspor data item name ke Excel -> Otomatis butuh 'read'
    // Catatan: Rute statis diletakkan di atas rute dinamis `/:id`
    this.router.get("/export/excel", this.itemNameController.exportItemNames);

    // 3. Ambil detail item name berdasarkan ID -> Otomatis butuh 'read'
    this.router.get("/:id", this.itemNameController.getItemNameById);

    // 4. Buat Item Name baru -> Otomatis butuh 'create'
    this.router.post(
      "/",
      validateBody(CreateItemNameDTO),
      this.itemNameController.createItemName,
    );

    // 5. Perbarui data Item Name -> Otomatis butuh 'update'
    this.router.patch(
      "/:id",
      validateBody(UpdateItemNameDTO),
      this.itemNameController.updateItemName,
    );

    // 6. Hapus Item Name -> Otomatis butuh 'delete'
    this.router.delete("/:id", this.itemNameController.deleteItemName);
  };

  getRouter(): Router {
    return this.router;
  }
}
