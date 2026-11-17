import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../../middleware/nextAuth.middleware";
import { validateBody } from "../../../../middleware/validation.middleware";
import { CrmLeadController } from "./crmLead.controller";
import { LinkCustomerDTO } from "./dto/linkCustomer.dto";
import { UpdateLeadNameDTO } from "./dto/updateLeadName.dto";

@autoInjectable()
export class CrmLeadRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly crmLeadController: CrmLeadController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Autentikasi Admin via NextAuth
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    this.router.get("/", this.crmLeadController.getLeads);
    this.router.post("/sync-from-wa", this.crmLeadController.syncFromWa);
    this.router.post("/batch-sync", this.crmLeadController.batchSync);
    this.router.get("/customers/search", this.crmLeadController.searchCustomers);
    this.router.get("/:id", this.crmLeadController.getLeadById);
    this.router.patch("/:id/name", validateBody(UpdateLeadNameDTO), this.crmLeadController.updateName);
    this.router.post("/:id/link-customer", validateBody(LinkCustomerDTO), this.crmLeadController.linkCustomer);
    this.router.post("/:id/unlink-customer", this.crmLeadController.unlinkCustomer);
  };

  public getRouter = (): Router => {
    return this.router;
  };
}
