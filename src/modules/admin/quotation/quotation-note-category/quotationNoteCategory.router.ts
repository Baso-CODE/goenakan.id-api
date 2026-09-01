import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
//  Import autoVerifyPermission dan hapus import verifyRole
import { autoVerifyPermission } from "../../../../middleware/permission.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import {
  CreateQuotationNoteCategoryDTO,
  UpdateQuotationNoteCategoryDTO,
} from "./dto/quotationNoteCategory.dto";
import { QuotationNoteCategoryController } from "./quotationNoteCategory.controller";

@autoInjectable()
export class QuotationNoteCategoryRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly controller: QuotationNoteCategoryController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang middleware pelindung di sini satu kali saja.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission());

    // ==========================================
    // GET ALL (Otomatis dicek izin 'read')
    // ==========================================
    this.router.get("/", this.controller.getAll);

    // ==========================================
    // GET BY ID (Otomatis dicek izin 'read')
    // ==========================================
    this.router.get("/:id", this.controller.getOne);

    // ==========================================
    // CREATE (Otomatis dicek izin 'create')
    // ==========================================
    this.router.post(
      "/",
      validateBody(CreateQuotationNoteCategoryDTO),
      this.controller.create,
    );

    // ==========================================
    // UPDATE (Otomatis dicek izin 'update')
    // ==========================================
    this.router.patch(
      "/:id",
      validateBody(UpdateQuotationNoteCategoryDTO),
      this.controller.update,
    );

    // ==========================================
    // DELETE (Otomatis dicek izin 'delete')
    // ==========================================
    this.router.delete("/:id", this.controller.delete);
  };

  getRouter(): Router {
    return this.router;
  }
}
