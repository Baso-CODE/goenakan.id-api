import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CreateBulkTagsDTO, CreateTagDTO, UpdateTagDTO, CreateTagCategoryDTO, UpdateTagCategoryDTO } from "./dto/tags.dto";
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
    // === EXPORT ROUTE ===
    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productTagController.exportTags,
    );

    // === LIST ROUTES ===
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productTagController.getAllTags,
    );

    this.router.get(
      "/list",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productTagController.getTagList,
    );

    // === TAG CATEGORY ROUTES ===
    this.router.get(
      "/categories",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productTagController.getAllTagCategories,
    );

    this.router.get(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productTagController.getTagCategoryById,
    );

    this.router.post(
      "/categories",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateTagCategoryDTO),
      this.productTagController.createTagCategory,
    );

    this.router.patch(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateTagCategoryDTO),
      this.productTagController.updateTagCategory,
    );

    this.router.delete(
      "/categories/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productTagController.deleteTagCategory,
    );

    // === CRUD ROUTES ===
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productTagController.getTagById,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateTagDTO),
      this.productTagController.createTag,
    );

    this.router.post(
      "/bulk",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateBulkTagsDTO),
      this.productTagController.createBulkTags,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateTagDTO),
      this.productTagController.updateTag,
    );

    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.productTagController.deleteTag,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
