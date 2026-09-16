import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import {
  CreateSuccessStoryDTO,
  UpdateSuccessStoryDTO,
} from "./dto/successStory.dto";
import { SuccessStoryController } from "./successStory.controller";

const upload = multer({ storage: multer.memoryStorage() });

const uploadFields = upload.fields([
  { name: "heroImage", maxCount: 1 },
  { name: "media1", maxCount: 1 },
  { name: "media2", maxCount: 1 },
]);

@autoInjectable()
export class SuccessStoryRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly controller: SuccessStoryController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // 🌐 PUBLIC ROUTES (Bisa diakses tanpa login)
    // ==========================================

    // 1. List semua cerita: /api/success-story/public?locale=en&page=1
    this.router.get("/public", this.controller.getAllPublic);

    // 2. List cerita berdasarkan klien: /api/success-story/public/client/ID_KLIEN
    this.router.get(
      "/public/client/:clientId",
      this.controller.getByClientPublic,
    );

    // 3. Detail cerita berdasarkan slug: /api/success-story/public/detail/SLUG_CERITA
    this.router.get("/public/detail/:slug", this.controller.getBySlugPublic);

    // ==========================================
    // 🛡️ GATEKEEPER (Wajib Login & Punya Izin)
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // === ADMIN ROUTES ===
    this.router.get("/admin/list", this.controller.getAllAdmin);
    this.router.get("/:id", this.controller.getById);

    this.router.post(
      "/",
      validateBody(CreateSuccessStoryDTO),
      this.controller.create,
    );

    this.router.patch(
      "/:id",
      uploadFields,
      validateBody(UpdateSuccessStoryDTO),
      this.controller.update,
    );

    this.router.delete("/:id", this.controller.delete);
  };

  getRouter(): Router {
    return this.router;
  }
}
