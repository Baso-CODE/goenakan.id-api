import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
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
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    //  Dibiarkan kosong agar middleware mendeteksi nama modul murni dari URL
    this.router.use(autoVerifyPermission("event_category"));

    // ==========================================
    // 2. ADMIN ROUTES (Otomatis Terlindungi)
    // ==========================================

    // GET ALL EVENT CATEGORIES (With Pagination & Search)
    this.router.get("/", this.eventCategoryController.getAllEventCategories);

    // GET BY ID
    this.router.get("/:id", this.eventCategoryController.getEventCategoryById);

    // CREATE EVENT CATEGORY
    this.router.post(
      "/",
      upload.single("image"),
      this.eventCategoryController.createEventCategory,
    );

    // UPDATE EVENT CATEGORY
    this.router.patch(
      "/:id",
      upload.single("image"),
      this.eventCategoryController.updateEventCategory,
    );

    // DELETE EVENT CATEGORY
    this.router.delete(
      "/:id",
      this.eventCategoryController.deleteEventCategory,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
