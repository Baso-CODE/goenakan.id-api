import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
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
    // Definisi middleware autentikasi dan role
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;
    const adminRole = verifyRole(["SUPER_ADMIN"]);

    // === ROUTES: Item Category Management ===

    // 1. Get all dengan pagination, search, & filter productCategoryId
    this.router.get(
      "/",
      auth,
      adminRole,
      this.itemCategoryController.getAllItemCategories,
    );

    // 2. Export data ke Excel
    this.router.get(
      "/export/excel",
      auth,
      adminRole,
      this.itemCategoryController.exportItemCategories,
    );

    // 3. Get by ID
    this.router.get(
      "/:id",
      auth,
      adminRole,
      this.itemCategoryController.getItemCategoryById,
    );

    // 4. Create New Item Category
    this.router.post(
      "/",
      auth,
      adminRole,
      validateBody(CreateItemCategoryDTO),
      this.itemCategoryController.createItemCategory,
    );

    // 5. Update Item Category
    this.router.patch(
      "/:id",
      auth,
      adminRole,
      validateBody(UpdateItemCategoryDTO),
      this.itemCategoryController.updateItemCategory,
    );

    // 6. Delete Item Category
    this.router.delete(
      "/:id",
      auth,
      adminRole,
      this.itemCategoryController.deleteItemCategory,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
