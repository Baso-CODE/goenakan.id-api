import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { CreateHeroSlideDTO, UpdateHeroSlideDTO } from "./dto/hero.dto";
import { HeroController } from "./hero.controller";

const upload = multer({ storage: multer.memoryStorage() });

//  Konfigurasi Multer untuk menerima banyak file berdasarkan nama field-nya
const uploadFields = upload.fields([
  { name: "imageDesktop", maxCount: 1 },
  { name: "imageMobile", maxCount: 1 },
  { name: "imageTablet", maxCount: 1 },
]);

@autoInjectable()
export class HeroRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly heroController: HeroController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // === PUBLIC ROUTE ===
    this.router.get("/public", this.heroController.getAllPublic);

    // === GATEKEEPER ===
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission("hero"));

    // === ADMIN ROUTES ===
    this.router.get("/admin/list", this.heroController.getAllAdmin);
    this.router.get("/:id", this.heroController.getById);

    // Create Slide (Gunakan uploadFields)
    this.router.post(
      "/",
      uploadFields,
      validateBody(CreateHeroSlideDTO),
      this.heroController.create,
    );

    // Update Slide (Gunakan uploadFields)
    this.router.patch(
      "/:id",
      uploadFields,
      validateBody(UpdateHeroSlideDTO),
      this.heroController.update,
    );

    this.router.delete("/:id", this.heroController.delete);
  };

  getRouter(): Router {
    return this.router;
  }
}
