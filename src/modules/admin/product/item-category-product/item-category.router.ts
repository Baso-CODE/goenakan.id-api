import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import {
  CreateItemCategoryDTO,
  UpdateItemCategoryDTO,
} from "./dto/item-category.dto";
import { ItemCategoryController } from "./item-category.controller";

@autoInjectable()
export class ItemCategoryRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly itemCategoryController: ItemCategoryController,
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
    this.router.use(autoVerifyPermission());

    // ==========================================
    // === ROUTES: Item Category Management ===
    // ==========================================

    // 1. Get all dengan pagination, search, & filter (Otomatis butuh 'read')
    this.router.get("/", this.itemCategoryController.getAllItemCategories);

    // 2. Export data ke Excel (Otomatis butuh 'read')
    // Catatan: Rute statis diletakkan di atas rute dinamis `/:id`
    this.router.get(
      "/export/excel",
      this.itemCategoryController.exportItemCategories,
    );

    // 3. Get by ID (Otomatis butuh 'read')
    this.router.get("/:id", this.itemCategoryController.getItemCategoryById);

    // 4. Create New Item Category (Otomatis butuh 'create')
    this.router.post(
      "/",
      validateBody(CreateItemCategoryDTO),
      this.itemCategoryController.createItemCategory,
    );

    // 5. Update Item Category (Otomatis butuh 'update')
    this.router.patch(
      "/:id",
      validateBody(UpdateItemCategoryDTO),
      this.itemCategoryController.updateItemCategory,
    );

    // 6. Delete Item Category (Otomatis butuh 'delete')
    this.router.delete("/:id", this.itemCategoryController.deleteItemCategory);
  };

  getRouter(): Router {
    return this.router;
  }
}
