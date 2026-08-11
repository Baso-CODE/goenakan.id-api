import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NoteCategoryController } from "./category-notes-invoice/categoryNotes.controller";
import { NoteTemplateController } from "./notes.controller";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";

import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
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
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // =========================================================
    // 1. NOTE CATEGORIES ROUTES (Prefix: /categories)
    // =========================================================

    // Get List Categories (Dropdown) - Statis di atas `/:slug`
    this.router.get(
      "/categories/list",
      this.categoryController.getDepartmentList,
    );

    // Export Excel Categories - Statis di atas `/:slug`
    this.router.get(
      "/categories/export/excel",
      this.categoryController.exportDepartment,
    );

    // Get All Categories (Pagination) -> Otomatis butuh 'read'
    this.router.get("/categories", this.categoryController.getAllDepartments);

    // Get Category By Slug -> Otomatis butuh 'read'
    this.router.get(
      "/categories/:slug",
      this.categoryController.getDepartmentBySlug,
    );

    // Create Category -> Otomatis butuh 'create'
    this.router.post(
      "/categories",
      validateBody(CreateNoteCategoryDTO),
      this.categoryController.createDepartment,
    );

    // Update Category -> Otomatis butuh 'update'
    this.router.patch(
      "/categories/:slug",
      validateBody(UpdateNoteCategoryDTO),
      this.categoryController.updateDepartment,
    );

    // Delete Category -> Otomatis butuh 'delete'
    this.router.delete(
      "/categories/:id",
      this.categoryController.deleteDepartment,
    );

    // =========================================================
    // 2. NOTE TEMPLATES ROUTES (Prefix: /templates)
    // =========================================================

    // Get Templates By Category ID (Dropdown Helper) - Statis di atas `/:id`
    this.router.get(
      "/templates/category/:categoryId",
      this.templateController.getByCategory,
    );

    // Export Excel Templates - Statis di atas `/:id`
    this.router.get(
      "/templates/export/excel",
      this.templateController.exportExcel,
    );

    // Get All Templates (Pagination) -> Otomatis butuh 'read'
    this.router.get("/templates", this.templateController.getAll);

    // Get Template By ID -> Otomatis butuh 'read'
    this.router.get("/templates/:id", this.templateController.getById);

    // Create Template -> Otomatis butuh 'create'
    this.router.post(
      "/templates",
      validateBody(CreateNoteTemplateDTO),
      this.templateController.create,
    );

    // Update Template -> Otomatis butuh 'update'
    this.router.patch(
      "/templates/:id",
      validateBody(UpdateNoteTemplateDTO),
      this.templateController.update,
    );

    // Delete Template -> Otomatis butuh 'delete'
    this.router.delete("/templates/:id", this.templateController.delete);
  };

  getRouter(): Router {
    return this.router;
  }
}
