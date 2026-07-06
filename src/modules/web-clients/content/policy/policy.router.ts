import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../../middleware/role.middleware";
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
    // SECTION 1: POLICY CATEGORIES ROUTES
    // ==========================================

    this.router.get(
      "/categories/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.policyController.exportCategory,
    );

    this.router.get(
      "/categories",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.policyController.getAllCategories,
    );

    this.router.get(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.policyController.getCategoryById,
    );

    this.router.post(
      "/categories",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      validateBody(CreatePolicyCategoryDTO),
      this.policyController.createCategory,
    );

    this.router.patch(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      validateBody(UpdatePolicyCategoryDTO),
      this.policyController.updateCategory,
    );

    this.router.delete(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.policyController.deleteCategory,
    );
    // ==========================================
    // SECTION 2: POLICY ITEMS (CONTENTS) ROUTES
    // ==========================================

    this.router.get(
      "/items",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.policyController.getAllPolicies,
    );

    this.router.post(
      "/items",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      validateBody(CreatePolicyDTO),
      this.policyController.createPolicy,
    );

    this.router.get(
      "/items/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.policyController.getPolicyById,
    );

    this.router.patch(
      "/items/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      validateBody(UpdatePolicyDTO),
      this.policyController.updatePolicy,
    );

    this.router.delete(
      "/items/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_ARTICLE"]),
      this.policyController.deletePolicy,
    );

    // ==========================================
    // SECTION 3: PUBLIC ROUTES (FOR FRONTEND/CLIENT)
    // ==========================================

    // Get semua kategori beserta seluruh kebijakan di dalamnya
    this.router.get(
      "/public/all",
      this.policyController.getAllCategoriesWithPolicies,
    );

    // Get detail kebijakan berdasarkan slug kategori
    this.router.get("/public/:slug", this.policyController.getPolicyBySlug);
  };

  getRouter(): Router {
    return this.router;
  }
}
