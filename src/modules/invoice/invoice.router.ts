import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { CreateInvoiceDTO } from "./dto/createInvoice.dto";
import { InvoiceController } from "./invoice.controller";

@autoInjectable()
export class InvoiceRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly invoiceController: InvoiceController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // this.router.get(
    //   "/all",
    //   this.nextAuthMiddleware.verifyNextAuthToken,
    //   verifyRole(["SUPER_ADMIN"]),
    //   this.invoiceController.getAllOrder,
    // );
    // this.router.get(
    //   "/:id",
    //   this.nextAuthMiddleware.verifyNextAuthToken,
    //   verifyRole(["SUPER_ADMIN"]),
    //   this.invoiceController.getOrderByIdDetail,
    // );
    // this.router.get(
    //   "/:id/edit-data",
    //   this.nextAuthMiddleware.verifyNextAuthToken,
    //   verifyRole(["SUPER_ADMIN"]),
    //   this.invoiceController.getOrderByIdUpdate,
    // );
    this.router.get(
      "/chart",
      // this.nextAuthMiddleware.verifyNextAuthToken,
      this.invoiceController.getRevenueChart,
    );
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.invoiceController.getAll,
    );
    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.invoiceController.getDetailInvoiceById,
    );
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      validateBody(CreateInvoiceDTO),
      this.invoiceController.createInvoice,
    );
    this.router.post(
      "/:id/pay",
      this.nextAuthMiddleware.verifyNextAuthToken,
      this.invoiceController.pay,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
