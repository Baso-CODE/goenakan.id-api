import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { DepartmentController } from "./departmen.controller";
import { CreateDepartmentDTO } from "./dto/createDepartment.dto";
import { UpdateDepartmentDTO } from "./dto/updateDepartment.dto";

@autoInjectable()
export class DepartmentRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly departmentController: DepartmentController,
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
    // === DEPARTMENT MANAGEMENT ROUTES ===
    // ==========================================

    // 1. Get All with Pagination (Otomatis butuh 'read')
    this.router.get("/", this.departmentController.getAllDepartments);

    // 2. List for Dropdown (Statis di atas `/:slug`) -> Otomatis butuh 'read'
    this.router.get("/list", this.departmentController.getDepartmentList);

    // 3. Export Excel (Statis di atas `/:slug`) -> Otomatis butuh 'read'
    this.router.get(
      "/export/excel",
      this.departmentController.exportDepartment,
    );

    // 4. Get By Slug -> Otomatis butuh 'read'
    this.router.get("/:slug", this.departmentController.getDepartmentBySlug);

    // 5. Create Department -> Otomatis butuh 'create'
    this.router.post(
      "/",
      validateBody(CreateDepartmentDTO),
      this.departmentController.createDepartment,
    );

    // 6. Update Department -> Otomatis butuh 'update'
    this.router.patch(
      "/:id",
      validateBody(UpdateDepartmentDTO),
      this.departmentController.updateDepartment,
    );

    // 7. Delete Department -> Otomatis butuh 'delete'
    this.router.delete("/:id", this.departmentController.deleteDepartment);
  };

  getRouter(): Router {
    return this.router;
  }
}
