import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
//  Import autoVerifyPermission
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
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
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission("invoice"));

    // ==========================================
    // === INVOICE MANAGEMENT ROUTES ===
    // ==========================================

    // 1. Get Revenue Chart (Statis di atas `/:id`) -> Otomatis butuh 'read'
    this.router.get("/chart", this.invoiceController.getRevenueChart);

    // 2. Get All Invoices -> Otomatis butuh 'read'
    this.router.get("/", this.invoiceController.getAll);

    // 3. Create Invoice -> Otomatis butuh 'create'
    this.router.post(
      "/",
      validateBody(CreateInvoiceDTO),
      this.invoiceController.createInvoice,
    );

    // 4. Pay Invoice (Statis turunan id di atas `/:id`) -> Otomatis butuh 'update' / 'create'
    this.router.post("/:id/pay", this.invoiceController.pay);

    // 5. Get Detail Invoice by ID -> Otomatis butuh 'read'
    this.router.get("/:id", this.invoiceController.getDetailInvoiceById);
  };

  getRouter(): Router {
    return this.router;
  }
}
