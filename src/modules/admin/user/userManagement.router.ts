import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { parseFormData } from "../../../middleware/parseFormData.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
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
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission("user"));

    // ==========================================
    // === GET ALL USERS ===
    // Otomatis membutuhkan hak akses 'read'
    // ==========================================
    this.router.get("/", this.userController.getAllUsers);
    this.router.get("/authors", this.userController.getAuthorsForFilter);
    // ==========================================
    // === CREATE NEW USER ===
    // Otomatis membutuhkan hak akses 'create'
    // ==========================================
    this.router.post(
      "/",
      upload.single("image"),
      parseFormData,
      validateBody(CreateUserDTO),
      this.userController.createUser,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
