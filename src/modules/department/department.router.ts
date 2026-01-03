import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { DepartmentController } from "./departmen.controller";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";
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
    // === GET ALL WITH PAGINATION ===
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.departmentController.getAllDepartments,
    );

    // === LIST FOR DROPDOWN ===
    this.router.get(
      "/list",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.departmentController.getDepartmentList,
    );

    // === GET BY ID ===
    this.router.get(
      "/:slug",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.departmentController.getDepartmentBySlug,
    );

    // === CREATE ===
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateDepartmentDTO),
      this.departmentController.createDepartment,
    );

    // === UPDATE ===
    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateDepartmentDTO),
      this.departmentController.updateDepartment,
    );

    // === DELETE ===
    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.departmentController.deleteDepartment,
    );
    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.departmentController.exportDepartment,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
