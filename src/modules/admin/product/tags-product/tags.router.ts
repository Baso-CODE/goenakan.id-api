import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import {
  CreateBulkTagsDTO,
  CreateTagCategoryDTO,
  CreateTagDTO,
  UpdateTagCategoryDTO,
  UpdateTagDTO,
} from "./dto/tags.dto";
import { ProductTagController } from "./tags.controller";

@autoInjectable()
export class ProductTagRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly productTagController: ProductTagController,
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
    this.router.use(autoVerifyPermission("product_tag"));

    // ==========================================
    // === EXPORT ROUTE ===
    // ==========================================
    this.router.get("/export/excel", this.productTagController.exportTags);

    // ==========================================
    // === LIST ROUTES ===
    // ==========================================
    this.router.get("/", this.productTagController.getAllTags);

    this.router.get("/list", this.productTagController.getTagList);

    // ==========================================
    // === TAG CATEGORY ROUTES ===
    // ==========================================
    this.router.get(
      "/categories",
      this.productTagController.getAllTagCategories,
    );

    this.router.get(
      "/categories/:id",
      this.productTagController.getTagCategoryById,
    );

    this.router.post(
      "/categories",
      validateBody(CreateTagCategoryDTO),
      this.productTagController.createTagCategory,
    );

    this.router.patch(
      "/categories/:id",
      validateBody(UpdateTagCategoryDTO),
      this.productTagController.updateTagCategory,
    );

    this.router.delete(
      "/categories/:id",
      this.productTagController.deleteTagCategory,
    );

    // ==========================================
    // === CRUD ROUTES ===
    // ==========================================
    this.router.post(
      "/bulk",
      validateBody(CreateBulkTagsDTO),
      this.productTagController.createBulkTags,
    );

    this.router.get("/:id", this.productTagController.getTagById);

    this.router.post(
      "/",
      validateBody(CreateTagDTO),
      this.productTagController.createTag,
    );

    this.router.patch(
      "/:id",
      validateBody(UpdateTagDTO),
      this.productTagController.updateTag,
    );

    this.router.delete("/:id", this.productTagController.deleteTag);
  };

  getRouter(): Router {
    return this.router;
  }
}
