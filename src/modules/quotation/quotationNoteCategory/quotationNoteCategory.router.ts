import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { verifyRole } from "../../../middleware/role.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
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
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    this.router.get("/", this.controller.getAll);
    this.router.get("/:id", this.controller.getOne);

    this.router.post(
      "/",
      verifyRole(["SUPER_ADMIN", "ADMIN"]),
      validateBody(CreateQuotationNoteCategoryDTO),
      this.controller.create,
    );

    this.router.patch(
      "/:id",
      verifyRole(["SUPER_ADMIN", "ADMIN"]),
      validateBody(UpdateQuotationNoteCategoryDTO),
      this.controller.update,
    );

    this.router.delete(
      "/:id",
      verifyRole(["SUPER_ADMIN", "ADMIN"]),
      this.controller.delete,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
