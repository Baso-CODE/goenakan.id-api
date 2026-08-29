import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
//  Import autoVerifyPermission dan hapus verifyRole
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
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
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // ==========================================
    // === ROLE & PERMISSION MANAGEMENT ROUTES ===
    // ==========================================

    // 1. Get Roles List (Dropdown) - Statis di atas `/:id`
    this.router.get("/list", this.roleController.getRolesList);

    // 2. Get All System Permissions - Statis di atas `/:id`
    this.router.get("/permissions/all", this.roleController.getAllPermissions);

    // 3. Get All Roles (Paginated) -> Otomatis butuh 'read'
    this.router.get("/", this.roleController.getAllRoles);

    // 4. Create New Role -> Otomatis butuh 'create'
    this.router.post(
      "/",
      validateBody(CreateRoleDTO),
      this.roleController.createRole,
    );

    // 5. Get Permissions By Role (Sub-rute statis di atas `/:id`) -> Otomatis butuh 'read'
    this.router.get("/:id/permissions", this.roleController.getRolePermissions);

    // 6. Assign Permissions To Role (Sub-rute statis di atas `/:id`) -> Otomatis butuh 'create' / 'update'
    this.router.post("/:id/permissions", this.roleController.assignPermissions);

    // 7. Get Role By ID -> Otomatis butuh 'read'
    this.router.get("/:id", this.roleController.getRoleById);

    // 8. Update Role -> Otomatis butuh 'update'
    this.router.patch(
      "/:id",
      validateBody(UpdateRoleDTO),
      this.roleController.updateRole,
    );

    // 9. Delete Role -> Otomatis butuh 'delete'
    this.router.delete("/:id", this.roleController.deleteRole);
  };

  getRouter(): Router {
    return this.router;
  }
}
