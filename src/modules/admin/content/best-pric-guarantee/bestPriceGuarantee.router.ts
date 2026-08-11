import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { BestPriceGuaranteeController } from "./bestPriceGuarantee.controller";
import {
  CreateBestPriceGuaranteeDTO,
  UpdateBestPriceGuaranteeDTO,
} from "./dto/bestPriceGuarantee.dto";
import {
  CreateBestPriceCategoryDTO,
  UpdateBestPriceCategoryDTO,
} from "./dto/bestPriceGuaranteeCategory.dto";

@autoInjectable()
export class BestPriceGuaranteeRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly bestPriceController: BestPriceGuaranteeController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // SECTION 1: PUBLIC ROUTES (CLIENT/FRONTEND)
    // Base Path: /public
    // ==========================================

    // 1. Get Main Page Guarantees
    this.router.get(
      "/public/main",
      this.bestPriceController.getMainPageGuarantees,
    );

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Semua rute di bawahnya (/categories dan /items) akan otomatis terlindungi.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    // ✨ Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission());

    // ==========================================
    // SECTION 2: BEST PRICE CATEGORIES ROUTES
    // Base Path: /categories
    // ==========================================

    // 1. Export Excel Category
    this.router.get(
      "/categories/export/excel",
      this.bestPriceController.exportCategoryToExcel,
    );

    // 2. List Category for Dropdown
    this.router.get(
      "/categories/list",
      this.bestPriceController.getAllCategoriesList,
    );

    // 3. Get All Categories (Pagination)
    this.router.get("/categories", this.bestPriceController.getAllCategories);

    // 4. Get Category By ID
    this.router.get(
      "/categories/:id",
      this.bestPriceController.getCategoryById,
    );

    // 5. Create Category
    this.router.post(
      "/categories",
      validateBody(CreateBestPriceCategoryDTO),
      this.bestPriceController.createCategory,
    );

    // 6. Update Category
    this.router.patch(
      "/categories/:id",
      validateBody(UpdateBestPriceCategoryDTO),
      this.bestPriceController.updateCategory,
    );

    // 7. Delete Category
    this.router.delete(
      "/categories/:id",
      this.bestPriceController.deleteCategory,
    );

    // ==========================================
    // SECTION 3: BEST PRICE ITEMS ROUTES
    // Base Path: /items
    // ==========================================

    // 1. Export Excel Items
    this.router.get(
      "/items/export/excel",
      this.bestPriceController.exportGuaranteeToExcel,
    );

    // 2. Get All Items (Pagination)
    this.router.get("/items", this.bestPriceController.getAllGuarantees);

    // 3. Get Item By ID
    this.router.get("/items/:id", this.bestPriceController.getGuaranteeById);

    // 4. Create Item
    this.router.post(
      "/items",
      validateBody(CreateBestPriceGuaranteeDTO),
      this.bestPriceController.createGuarantee,
    );

    // 5. Update Item
    this.router.patch(
      "/items/:id",
      validateBody(UpdateBestPriceGuaranteeDTO),
      this.bestPriceController.updateGuarantee,
    );

    // 6. Delete Item
    this.router.delete("/items/:id", this.bestPriceController.deleteGuarantee);
  };

  getRouter(): Router {
    return this.router;
  }
}
