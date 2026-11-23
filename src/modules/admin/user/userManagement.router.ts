import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";

import { AuthenticatedRequest } from "../../../middleware/AuthenticatedUser";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { parseFormData } from "../../../middleware/parseFormData.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { authLimiter } from "../../../middleware/rateLimiter.middleware";
import { validateBody } from "../../../middleware/validation.middleware";

import {
  ActivateAdminAccountDTO,
  CreateUserDTO,
  UpdateUserDTO,
} from "./dto/userManagement.dto";
import { UserController } from "./userManagement.controller";

// ==========================================
// PROFILE IMAGE UPLOAD
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

// ==========================================
// SIGNATURE IMAGE UPLOAD
// ==========================================
const uploadSignature = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error("Tanda tangan harus menggunakan PNG, JPG, atau WebP."),
      );
    }

    cb(null, true);
  },
});

// ==========================================
// SUPER ADMIN AUTHORIZATION
// ==========================================
const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;

  if (authReq.user?.role !== "SUPER_ADMIN") {
    res.status(403).json({
      message: "Hanya Super Admin yang memiliki akses.",
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
    // ==========================================
    // PUBLIC: ACTIVATE ADMIN ACCOUNT
    // ==========================================
    this.router.post(
      "/activate-account",
      authLimiter,
      validateBody(ActivateAdminAccountDTO),
      this.userController.activateAdminAccount,
    );

    // ==========================================
    // AUTHENTICATION FOR PRIVATE ROUTES
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    // ==========================================
    // OWN SIGNATURE
    // ==========================================
    // Tidak memerlukan permission update_user.
    // Hanya pemilik akun yang bisa mengganti
    // tanda tangannya sendiri.
    // Role diperiksa ulang di UserService.
    this.router.get("/me/signature", this.userController.getMySignature);

    this.router.patch(
      "/me/signature",
      uploadSignature.single("signature"),
      this.userController.updateSignature,
    );
    // ==========================================
    // DYNAMIC USER PERMISSIONS
    // ==========================================
    this.router.use(autoVerifyPermission("user"));

    // ==========================================
    // READ USERS
    // ==========================================
    this.router.get("/", this.userController.getAllUsers);

    this.router.get("/authors", this.userController.getAuthorsForFilter);

    // ==========================================
    // UPDATE OTHER USER SIGNATURE
    // SUPER ADMIN ONLY
    // ==========================================
    this.router.patch(
      "/:id/signature",
      requireSuperAdmin,
      uploadSignature.single("signature"),
      this.userController.updateSignature,
    );

    // ==========================================
    // GET USER BY ID
    // ==========================================
    this.router.get("/:id", this.userController.getUserById);

    // ==========================================
    // CREATE USER
    // SUPER ADMIN ONLY
    // ==========================================
    this.router.post(
      "/",
      requireSuperAdmin,
      upload.single("image"),
      parseFormData,
      validateBody(CreateUserDTO),
      this.userController.createUser,
    );

    // ==========================================
    // RESEND ADMIN INVITATION
    // SUPER ADMIN ONLY
    // ==========================================
    this.router.post(
      "/:id/resend-invitation",
      requireSuperAdmin,
      this.userController.resendAdminInvitation,
    );

    // ==========================================
    // UPDATE USER
    // SUPER ADMIN ONLY
    // ==========================================
    this.router.patch(
      "/:id",
      requireSuperAdmin,
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
