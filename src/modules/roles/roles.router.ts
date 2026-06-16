import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";
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
    // === GET ALL ROLES (PAGINATED) ===
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.roleController.getAllRoles,
    );

    // === GET ROLES LIST (UNTUK DROPDOWN) ===
    this.router.get(
      "/list",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.roleController.getRolesList,
    );

    // === GET ROLE BY ID ===
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.roleController.getRoleById,
    );

    // === CREATE NEW ROLE ===
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateRoleDTO),
      this.roleController.createRole,
    );

    // === UPDATE ROLE ===
    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateRoleDTO),
      this.roleController.updateRole,
    );

    // === DELETE ROLE ===
    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.roleController.deleteRole,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
