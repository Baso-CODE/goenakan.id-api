import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { parseFormData } from "../../middleware/parseFormData.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";

import { CreateUserDTO } from "./dto/userManagement.dto";
import { UserController } from "./userManagement.controller";

const upload = multer({ storage: multer.memoryStorage() });

@autoInjectable()
export class UserRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly userController: UserController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // === GET ALL USERS ===
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.userController.getAllUsers,
    );

    // === CREATE NEW USER ===
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      upload.single("image"),
      parseFormData,
      validateBody(CreateUserDTO),
      this.userController.createUser,
    );

    // =========================================================================
    // BOILERPLATE UNTUK FITUR SELANJUTNYA (GET BY ID, UPDATE, DELETE)
    // Silakan buka komentar di bawah ini jika endpoint-nya sudah siap di controller
    // =========================================================================

    /*
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.userController.getUserById,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      upload.single("image"),
      parseFormData,
      // validateBody(UpdateUserDTO),
      this.userController.updateUser,
    );

    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.userController.deleteUser,
    );
    */
  };

  getRouter(): Router {
    return this.router;
  }
}
