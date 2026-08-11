import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../../middleware/role.middleware";
import { EventCategoryController } from "./event-category.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit 5MB
});

@autoInjectable()
export class EventCategoryRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly eventCategoryController: EventCategoryController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;
    const adminRole = verifyRole(["SUPER_ADMIN"]);

    // ==========================================
    // 1. PUBLIC ROUTES (Tanpa Autentikasi)
    // ==========================================

    // GET /api/event-categories/public (Untuk Landing Page)
    this.router.get(
      "/public",
      this.eventCategoryController.getPublicEventCategories,
    );
    this.router.get("/list", this.eventCategoryController.getEventCategoryList);
    this.router.get(
      "/public/:slug",
      this.eventCategoryController.getPublicEventCategoryBySlug,
    );

    // ==========================================
    // 2. ADMIN ROUTES (Gunakan Auth & Role)
    // ==========================================

    // GET ALL EVENT CATEGORIES (With Pagination & Search)
    this.router.get(
      "/",
      auth,
      adminRole,
      this.eventCategoryController.getAllEventCategories,
    );

    // GET BY ID
    this.router.get(
      "/:id",
      auth,
      adminRole,
      this.eventCategoryController.getEventCategoryById,
    );

    // CREATE EVENT CATEGORY
    this.router.post(
      "/",
      auth,
      adminRole,
      upload.single("image"),
      this.eventCategoryController.createEventCategory,
    );

    // UPDATE EVENT CATEGORY
    this.router.patch(
      "/:id",
      auth,
      adminRole,
      upload.single("image"),
      this.eventCategoryController.updateEventCategory,
    );

    // DELETE EVENT CATEGORY
    this.router.delete(
      "/:id",
      auth,
      adminRole,
      this.eventCategoryController.deleteEventCategory,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
