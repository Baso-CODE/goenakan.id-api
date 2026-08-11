import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import {
  CreateFaqCategoryDTO,
  UpdateFaqCategoryDTO,
} from "./dto/faq-category.dto";
import { CreateFaqDTO, UpdateFaqDTO } from "./dto/faq.dto";
import { FaqController } from "./faq.controller";

@autoInjectable()
export class FaqRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly faqController: FaqController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // SECTION 1: PUBLIC ROUTES (CLIENT/FRONTEND)
    // Diletakkan di atas agar bebas diakses tanpa login
    // ==========================================

    // 1. Get Landing Page FAQs (Hanya Featured = true)
    this.router.get("/public/landing", this.faqController.getLandingPageFaqs);

    // 2. Get Main Page FAQs (Semua non-featured, Pagination, per Kategori)
    this.router.get("/public/main", this.faqController.getMainPageFaqs);

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Semua rute di bawahnya (/categories dan /items) akan otomatis terlindungi.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    // ✨ Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission());

    // ==========================================
    // SECTION 2: FAQ CATEGORIES ROUTES
    // Base Path: /categories
    // ==========================================

    // 1. Export Excel Category (Wajib ditaruh sebelum /:id)
    this.router.get(
      "/categories/export/excel",
      this.faqController.exportCategory,
    );

    // 2. List Category for Dropdown (Wajib ditaruh sebelum /:id)
    this.router.get("/categories/list", this.faqController.getCategoryList);

    // 3. Get All Categories (Pagination)
    this.router.get("/categories", this.faqController.getAllCategories);

    // 4. Get Category By ID
    this.router.get("/categories/:id", this.faqController.getCategoryById);

    // 5. Create Category
    this.router.post(
      "/categories",
      validateBody(CreateFaqCategoryDTO),
      this.faqController.createCategory,
    );

    // 6. Update Category
    this.router.patch(
      "/categories/:id",
      validateBody(UpdateFaqCategoryDTO),
      this.faqController.updateCategory,
    );

    // 7. Delete Category
    this.router.delete("/categories/:id", this.faqController.deleteCategory);

    // ==========================================
    // SECTION 3: FAQ ITEMS ROUTES
    // Base Path: /items
    // ==========================================

    // 1. Export Excel FAQ Items
    this.router.get("/items/export/excel", this.faqController.exportFaq);

    // 2. Get All FAQs (Pagination)
    this.router.get("/items", this.faqController.getAllFaqs);

    // 3. Get FAQ By ID
    this.router.get("/items/:id", this.faqController.getFaqById);

    // 4. Create FAQ
    this.router.post(
      "/items",
      validateBody(CreateFaqDTO),
      this.faqController.createFaq,
    );

    // 5. Update FAQ
    this.router.patch(
      "/items/:id",
      validateBody(UpdateFaqDTO),
      this.faqController.updateFaq,
    );

    // 6. Delete FAQ
    this.router.delete("/items/:id", this.faqController.deleteFaq);
  };

  getRouter(): Router {
    return this.router;
  }
}
