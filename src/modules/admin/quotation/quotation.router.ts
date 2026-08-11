import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { QuotationController } from "./quotation.controller";

// DTOs & Middlewares
import multer from "multer";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { parseFormData } from "../../../middleware/parseFormData.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CreateFollowUpDTO } from "./dto/follow-up.dto";
import { CreateQuotationDTO, UpdateQuotationDTO } from "./dto/quotation.dto";

const upload = multer({ storage: multer.memoryStorage() });

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
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // ==========================================
    // QUOTATION ROUTES
    // ==========================================

    // Get All (Table List)
    this.router.get("/", this.quotationController.getAll);

    // Get List References
    this.router.get(
      "/list-references",
      this.quotationController.getQuotationReferences,
    );

    // Get All Global Follow Ups
    this.router.get(
      "/follow-ups/all",
      this.quotationController.getAllGlobalFollowUps,
    );

    // Print Quotation
    this.router.get("/print/:id", this.quotationController.getForPrint);

    // Get Detail
    this.router.get("/:id", this.quotationController.getById);

    // Create
    this.router.post(
      "/",
      upload.any(),
      parseFormData,
      validateBody(CreateQuotationDTO),
      this.quotationController.create,
    );

    // Update
    this.router.patch(
      "/:id",
      validateBody(UpdateQuotationDTO),
      this.quotationController.update,
    );

    // Delete
    this.router.delete("/:id", this.quotationController.delete);

    // ==========================================
    // FOLLOW UP ROUTES
    // ==========================================

    // Add Follow Up
    this.router.post(
      "/:id/follow-up",
      validateBody(CreateFollowUpDTO),
      this.quotationController.addFollowUp,
    );

    // Get Follow Up History
    this.router.get("/:id/follow-up", this.quotationController.getFollowUps);
  };

  getRouter(): Router {
    return this.router;
  }
}
