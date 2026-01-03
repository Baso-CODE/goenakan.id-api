import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { AttributeController } from "./attributes.controller";
import { CreateAttributeDTO } from "./dto/createAttributes.dto";
import { UpdateAttributeDTO } from "./dto/updateAttributes.dto";

@autoInjectable()
export class AttributeRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly attributeController: AttributeController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // === PUBLIC / ADMIN ROUTES ===
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.attributeController.getAllAttributes,
    );

    this.router.get(
      "/list",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.attributeController.getAttributeList,
    );

    // === PROTECTED ROUTES ===
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.attributeController.getAttributeById,
    );

    // CREATE ATTRIBUTE + VALUES SEKALIGUS
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateAttributeDTO),
      this.attributeController.createAttribute,
    );

    // UPDATE ATTRIBUTE + VALUES SEKALIGUS
    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateAttributeDTO),
      this.attributeController.updateAttribute,
    );

    // DELETE ATTRIBUTE
    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.attributeController.deleteAttribute,
    );
    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.attributeController.exportAttributes,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
