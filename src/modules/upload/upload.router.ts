import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { UploadController } from "./upload.controller";

@autoInjectable()
export class UploadRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly controller: UploadController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // 🛡️ Pasang middleware agar hanya user terotentikasi yang bisa akses
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    // 🌐 Endpoint: GET /api/upload/signature?folder=namanya
    this.router.get("/signature", this.controller.getSignature);
  };

  getRouter(): Router {
    return this.router;
  }
}
