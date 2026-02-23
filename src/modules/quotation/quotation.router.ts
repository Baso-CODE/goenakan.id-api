import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { QuotationController } from "./quotation.controller";

// DTOs
import { CreateFollowUpDTO } from "./dto/follow-up.dto";
import { CreateQuotationDTO, UpdateQuotationDTO } from "./dto/quotation.dto";

@autoInjectable()
export class QuotationRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly quotationController: QuotationController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // QUOTATION ROUTES
    // ==========================================

    // Get All (Table List)
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_INVOICE"]), // Sesuaikan Role
      this.quotationController.getAll,
    );
    this.router.get(
      "/print/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_INVOICE"]),
      this.quotationController.getForPrint,
    );

    // Get Detail
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_INVOICE"]),
      this.quotationController.getById,
    );

    // Create
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_INVOICE"]),
      validateBody(CreateQuotationDTO),
      this.quotationController.create,
    );

    // Update
    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_INVOICE"]),
      validateBody(UpdateQuotationDTO),
      this.quotationController.update,
    );

    // Delete
    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_INVOICE"]),
      this.quotationController.delete,
    );

    // ==========================================
    // FOLLOW UP ROUTES
    // ==========================================

    // Add Follow Up
    this.router.post(
      "/:id/follow-up",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_INVOICE"]),
      validateBody(CreateFollowUpDTO),
      this.quotationController.addFollowUp,
    );

    // Get Follow Up History
    this.router.get(
      "/:id/follow-up",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN", "ADMIN_INVOICE"]),
      this.quotationController.getFollowUps,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
