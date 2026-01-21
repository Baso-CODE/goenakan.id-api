import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
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
    // SECTION 1: FAQ CATEGORIES ROUTES
    // Base Path: /categories
    // ==========================================

    // 1. Export Excel Category (Wajib ditaruh sebelum /:id)
    this.router.get(
      "/categories/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]), // Sesuaikan role
      this.faqController.exportCategory,
    );

    // 2. List Category for Dropdown (Wajib ditaruh sebelum /:id)
    this.router.get(
      "/categories/list",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.faqController.getCategoryList,
    );

    // 3. Get All Categories (Pagination)
    this.router.get(
      "/categories",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.faqController.getAllCategories,
    );

    // 4. Get Category By ID
    this.router.get(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.faqController.getCategoryById,
    );

    // 5. Create Category
    this.router.post(
      "/categories",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      validateBody(CreateFaqCategoryDTO),
      this.faqController.createCategory,
    );

    // 6. Update Category
    this.router.patch(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      validateBody(UpdateFaqCategoryDTO),
      this.faqController.updateCategory,
    );

    // 7. Delete Category
    this.router.delete(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.faqController.deleteCategory,
    );

    // ==========================================
    // SECTION 2: FAQ ITEMS ROUTES
    // Base Path: /items
    // ==========================================

    // 1. Export Excel FAQ Items
    this.router.get(
      "/items/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.faqController.exportFaq,
    );

    // 2. Get All FAQs (Pagination)
    this.router.get(
      "/items",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.faqController.getAllFaqs,
    );

    // 3. Get FAQ By ID
    this.router.get(
      "/items/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.faqController.getFaqById,
    );

    // 4. Create FAQ
    this.router.post(
      "/items",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      validateBody(CreateFaqDTO),
      this.faqController.createFaq,
    );

    // 5. Update FAQ
    this.router.patch(
      "/items/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      validateBody(UpdateFaqDTO),
      this.faqController.updateFaq,
    );

    // 6. Delete FAQ
    this.router.delete(
      "/items/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.faqController.deleteFaq,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
