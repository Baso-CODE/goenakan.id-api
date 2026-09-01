import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import {
  CreatePolicyCategoryDTO,
  UpdatePolicyCategoryDTO,
} from "./dto/policy-category.dto";
import { CreatePolicyDTO, UpdatePolicyDTO } from "./dto/policy.dto";
import { PolicyController } from "./policy.controller";

@autoInjectable()
export class PolicyRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly policyController: PolicyController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // SECTION 1: PUBLIC ROUTES (FOR FRONTEND/CLIENT)
    // Diletakkan di atas agar bebas diakses tanpa login
    // ==========================================

    // Get semua kategori beserta seluruh kebijakan di dalamnya
    this.router.get(
      "/public/all",
      this.policyController.getAllCategoriesWithPolicies,
    );

    // Get detail kebijakan berdasarkan slug kategori
    this.router.get("/public/:slug", this.policyController.getPolicyBySlug);

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Semua rute di bawahnya (/categories dan /items) akan otomatis terlindungi.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    //  Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission());

    // ==========================================
    // SECTION 2: POLICY CATEGORIES ROUTES
    // ==========================================

    this.router.get(
      "/categories/export/excel",
      this.policyController.exportCategory,
    );

    this.router.get("/categories", this.policyController.getAllCategories);

    this.router.get("/categories/:id", this.policyController.getCategoryById);

    this.router.post(
      "/categories",
      validateBody(CreatePolicyCategoryDTO),
      this.policyController.createCategory,
    );

    this.router.patch(
      "/categories/:id",
      validateBody(UpdatePolicyCategoryDTO),
      this.policyController.updateCategory,
    );

    this.router.delete("/categories/:id", this.policyController.deleteCategory);

    // ==========================================
    // SECTION 3: POLICY ITEMS (CONTENTS) ROUTES
    // ==========================================

    this.router.get("/items", this.policyController.getAllPolicies);

    this.router.post(
      "/items",
      validateBody(CreatePolicyDTO),
      this.policyController.createPolicy,
    );

    this.router.get("/items/:id", this.policyController.getPolicyById);

    this.router.patch(
      "/items/:id",
      validateBody(UpdatePolicyDTO),
      this.policyController.updatePolicy,
    );

    this.router.delete("/items/:id", this.policyController.deletePolicy);
  };

  getRouter(): Router {
    return this.router;
  }
}
