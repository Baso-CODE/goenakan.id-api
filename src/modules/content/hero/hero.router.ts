// src/services/hero/hero.router.ts

import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CreateHeroSlideDTO, UpdateHeroSlideDTO } from "./dto/hero.dto";
import { HeroController } from "./hero.controller";

const upload = multer({ storage: multer.memoryStorage() });

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
    this.router.get("/", this.heroController.getAllPublic);

    // === PROTECTED ROUTES (ADMIN) ===

    // Get All (Table Admin)
    this.router.get(
      "/admin/list",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.heroController.getAllAdmin,
    );

    // Get By ID
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.heroController.getById,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      upload.single("image"),
      validateBody(CreateHeroSlideDTO),
      this.heroController.create,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      upload.single("image"),
      validateBody(UpdateHeroSlideDTO),
      this.heroController.update,
    );

    // Delete Slide
    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.heroController.delete,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
