import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifySuperAdmin } from "../../../middleware/superAdmin.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CreateRoleDTO, UpdateRoleDTO } from "./dto/roles.dto";
import { RoleController } from "./roles.controller";

@autoInjectable()
export class RoleRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly roleController: RoleController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(verifySuperAdmin);

    this.router.get("/list", this.roleController.getRolesList);

    this.router.get("/permissions/all", this.roleController.getAllPermissions);

    this.router.get("/", this.roleController.getAllRoles);

    this.router.post(
      "/",
      validateBody(CreateRoleDTO),
      this.roleController.createRole,
    );

    this.router.get("/:id/permissions", this.roleController.getRolePermissions);

    this.router.post("/:id/permissions", this.roleController.assignPermissions);

    this.router.get("/:id", this.roleController.getRoleById);

    this.router.patch(
      "/:id",
      validateBody(UpdateRoleDTO),
      this.roleController.updateRole,
    );

    this.router.delete("/:id", this.roleController.deleteRole);
  };

  getRouter(): Router {
    return this.router;
  }
}
