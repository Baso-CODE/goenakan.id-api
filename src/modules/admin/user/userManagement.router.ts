import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { AuthenticatedRequest } from "../../../middleware/AuthenticatedUser";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { parseFormData } from "../../../middleware/parseFormData.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";

import {
  ActivateAdminAccountDTO,
  CreateUserDTO,
  UpdateUserDTO,
} from "./dto/userManagement.dto";

import { authLimiter } from "../../../middleware/rateLimiter.middleware";
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

const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;

  if (authReq.user?.role !== "SUPER_ADMIN") {
    res.status(403).json({
      message:
        "Hanya Super Admin yang dapat membuat akun dan mengirim ulang undangan.",
    });
    return;
  }

  next();
};

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
    // ==================================================
    // PUBLIC: AKTIVASI AKUN (TIDAK PERLU LOGIN)
    // ==================================================
    this.router.post(
      "/activate-account",
      authLimiter,
      validateBody(ActivateAdminAccountDTO),
      this.userController.activateAdminAccount,
    );

    // ==================================================
    // AUTHENTICATION
    // ==================================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    this.router.use(autoVerifyPermission("user"));

    // ==================================================
    // READ USERS
    // ==================================================
    this.router.get("/", this.userController.getAllUsers);

    this.router.get("/authors", this.userController.getAuthorsForFilter);

    this.router.get("/:id", this.userController.getUserById);

    // ==================================================
    // CREATE USER - SUPER ADMIN ONLY
    // ==================================================
    this.router.post(
      "/",
      requireSuperAdmin,
      upload.single("image"),
      parseFormData,
      validateBody(CreateUserDTO),
      this.userController.createUser,
    );

    // ==================================================
    // RESEND INVITATION - SUPER ADMIN ONLY
    // ============================================invitation======
    this.router.post(
      "/:id/resend-invitation",
      requireSuperAdmin,
      this.userController.resendAdminInvitation,
    );

    // ==================================================
    // UPDATE USER
    // ==================================================
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
