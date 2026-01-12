import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";

import { NoteCategoryController } from "./category/categoryNotes.controller";
import { NoteTemplateController } from "./notes.controller";

// DTOs

import { CreateNoteCategoryDTO } from "./dto/createCategory.dto";
import { CreateNoteTemplateDTO } from "./dto/createNoteTemplate.dto";
import { UpdateNoteCategoryDTO } from "./dto/updateCategory.dto";
import { UpdateNoteTemplateDTO } from "./dto/updateNoteTemplate.dto";

@autoInjectable()
export class NoteRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly categoryController: NoteCategoryController,
    private readonly templateController: NoteTemplateController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // =========================================================
    // 1. NOTE CATEGORIES ROUTES (Prefix: /categories)
    // =========================================================

    // Get All Categories (Pagination)
    this.router.get(
      "/categories",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.categoryController.getAllDepartments,
    );

    // Get List Categories (Dropdown)
    this.router.get(
      "/categories/list",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.categoryController.getDepartmentList,
    );

    // Export Excel Categories
    this.router.get(
      "/categories/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.categoryController.exportDepartment,
    );

    // Get Category By Slug
    this.router.get(
      "/categories/:slug",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.categoryController.getDepartmentBySlug,
    );

    // Create Category
    this.router.post(
      "/categories",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateNoteCategoryDTO),
      this.categoryController.createDepartment,
    );

    // Update Category
    this.router.patch(
      "/categories/:slug",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateNoteCategoryDTO),
      this.categoryController.updateDepartment,
    );

    // Delete Category
    this.router.delete(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.categoryController.deleteDepartment,
    );

    // =========================================================
    // 2. NOTE TEMPLATES ROUTES (Prefix: /templates)
    // =========================================================

    // Get All Templates (Pagination)
    this.router.get(
      "/templates",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.templateController.getAll,
    );

    // Get Templates By Category ID (Dropdown Helper)
    this.router.get(
      "/templates/category/:categoryId",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.templateController.getByCategory,
    );

    // Export Excel Templates
    this.router.get(
      "/templates/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.templateController.exportExcel,
    );

    // Get Template By ID
    this.router.get(
      "/templates/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.templateController.getById,
    );

    // Create Template
    this.router.post(
      "/templates",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateNoteTemplateDTO),
      this.templateController.create,
    );

    // Update Template
    this.router.patch(
      "/templates/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateNoteTemplateDTO),
      this.templateController.update,
    );

    // Delete Template
    this.router.delete(
      "/templates/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.templateController.delete,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
