import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { CashflowController } from "./cashflow.controller";
import { SaveCashflowDTO } from "./dto/cashflow.dto";

@autoInjectable()
export class CashflowRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly cashflowController: CashflowController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.cashflowController.getAll,
    );
    this.router.get(
      "/detail",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.cashflowController.getDetailByOrder,
    );
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(SaveCashflowDTO),
      this.cashflowController.save,
    );
    // this.router.get(
    //   "/:id",
    //   this.nextAuthMiddleware.verifyNextAuthToken,
    //   verifyRole(["SUPER_ADMIN"]),
    //   this.orderController.getOrderByIdDetail,
    // );
    // this.router.get(
    //   "/:id/edit-data",
    //   this.nextAuthMiddleware.verifyNextAuthToken,
    //   verifyRole(["SUPER_ADMIN"]),
    //   this.orderController.getOrderByIdUpdate,
    // );
    // this.router.post(
    //   "/",
    //   this.nextAuthMiddleware.verifyNextAuthToken,
    //   verifyRole(["SUPER_ADMIN"]),
    //   validateBody(CreateOrderDTO),
    //   this.orderController.createOrder,
    // );
    // this.router.patch(
    //   "/:id",
    //   this.nextAuthMiddleware.verifyNextAuthToken,
    //   verifyRole(["SUPER_ADMIN"]),
    //   validateBody(UpdateOrderDTO),
    //   this.orderController.updateOrder,
    // );
    // this.router.get(
    //   "/export/excel",
    //   this.nextAuthMiddleware.verifyNextAuthToken,
    //   verifyRole(["SUPER_ADMIN"]),
    //   this.orderController.exportOrders,
    // );
  };

  getRouter(): Router {
    return this.router;
  }
}
