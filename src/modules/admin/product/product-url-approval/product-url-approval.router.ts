import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";

import { CreateProductUrlRequestDTO } from "./dto/create-product-url-request.dto";
import { ReviewProductUrlRequestDTO } from "./dto/review-product-url-request.dto";
import { ProductUrlApprovalController } from "./product-url-approval.controller";

@autoInjectable()
export class ProductUrlApprovalRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly controller: ProductUrlApprovalController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    // Admin dengan permission produk boleh mengajukan.
    this.router.post(
      "/products/:productId/requests",
      autoVerifyPermission("product", "update"),
      validateBody(CreateProductUrlRequestDTO),
      this.controller.requestChange,
    );

    // Daftar request. Service approval akan
    // memvalidasi role Super Admin untuk tindakan approve.
    this.router.get(
      "/requests",
      autoVerifyPermission("product", "read"),
      this.controller.getRequests,
    );

    this.router.patch(
      "/requests/:id/approve",
      autoVerifyPermission("product", "update"),
      validateBody(ReviewProductUrlRequestDTO),
      this.controller.approve,
    );

    this.router.patch(
      "/requests/:id/reject",
      autoVerifyPermission("product", "update"),
      validateBody(ReviewProductUrlRequestDTO),
      this.controller.reject,
    );
  }

  getRouter(): Router {
    return this.router;
  }
}
