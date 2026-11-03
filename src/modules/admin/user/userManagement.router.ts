import { Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { parseFormData } from "../../../middleware/parseFormData.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";

import { CreateUserDTO, UpdateUserDTO } from "./dto/userManagement.dto";

import { UserController } from "./userManagement.controller";

// ==========================================
// MULTER CONFIG
// ==========================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("File harus berupa gambar"));
    }

    cb(null, true);
  },
});

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
    // AUTHENTICATION & PERMISSION
    // ==========================================

    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    this.router.use(autoVerifyPermission("user"));

    // ==========================================
    // GET ALL USERS
    // Permission: user.read
    // ==========================================

    this.router.get("/", this.userController.getAllUsers);

    // ==========================================
    // GET AUTHORS
    // Permission: user.read
    // ==========================================

    this.router.get("/authors", this.userController.getAuthorsForFilter);

    this.router.get("/:id", this.userController.getUserById);

    // ==========================================
    // CREATE USER
    // Permission: user.create
    // ==========================================

    this.router.post(
      "/",
      upload.single("image"),
      parseFormData,
      validateBody(CreateUserDTO),
      this.userController.createUser,
    );

    // ==========================================
    // UPDATE USER
    // Permission: user.update
    // ==========================================

    this.router.patch(
      "/:id",
      upload.single("image"),
      parseFormData,
      validateBody(UpdateUserDTO),
      this.userController.updateUser,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
