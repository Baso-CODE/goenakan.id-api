import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
// ✨ Import autoVerifyPermission dan hapus verifyRole
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CreateOrderDTO } from "./dto/createOrder.dto";
import { UpdateOrderDTO } from "./dto/upadateOrder.dto";
import { OrderController } from "./order.controller";

@autoInjectable()
export class OrderRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly orderController: OrderController,
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
    this.router.use(autoVerifyPermission());

    // ==========================================
    // === ORDER MANAGEMENT ROUTES ===
    // ==========================================

    // 1. Get All Orders (Otomatis butuh 'read')
    this.router.get("/all", this.orderController.getAllOrder);

    // 2. Combined Orders (Otomatis butuh 'read')
    this.router.get("/combined", this.orderController.getAllCombinedOrders);

    // 3. Sample Orders (Otomatis butuh 'read')
    this.router.get("/samples", this.orderController.getSampleOrders);

    // 4. Sample Order References (Otomatis butuh 'read')
    this.router.get(
      "/list-samples",
      this.orderController.getSampleOrderReferences,
    );

    // 5. Sample Stats (Otomatis butuh 'read')
    this.router.get("/stats/sample", this.orderController.getSampleStats);

    // 6. General Stats (Otomatis butuh 'read')
    this.router.get("/stats/general", this.orderController.getGeneralStats);

    // 7. Export Excel (Otomatis butuh 'read')
    this.router.get("/export/excel", this.orderController.exportOrders);

    // 8. Generate PO Number (Otomatis butuh 'read' / 'create')
    this.router.get("/generate-po", this.orderController.generatePoNumber);

    // 9. Analytics Charts (Otomatis butuh 'read')
    this.router.get("/analytics/charts", this.orderController.getChartData);

    // 10. Analytics Metrics (Otomatis butuh 'read')
    this.router.get("/analytics/metrics", this.orderController.getMetrics);

    // 11. Create Order (Otomatis butuh 'create')
    this.router.post(
      "/",
      validateBody(CreateOrderDTO),
      this.orderController.createOrder,
    );

    // 12. Tracking by ID (Statis di atas `/:id`) -> Otomatis butuh 'read'
    this.router.get("/:id/tracking", this.orderController.getForTracking);

    // 13. Edit Data by ID (Statis di atas `/:id`) -> Otomatis butuh 'read'
    this.router.get("/:id/edit-data", this.orderController.getOrderByIdUpdate);

    // 14. Replacement Data by ID (Statis di atas `/:id`) -> Otomatis butuh 'read'
    this.router.get(
      "/:id/replacement-data",
      this.orderController.getOrderByIdReplacement,
    );

    // 15. Get Detail by ID -> Otomatis butuh 'read'
    this.router.get("/:id", this.orderController.getOrderByIdDetail);

    // 16. Update Order -> Otomatis butuh 'update'
    this.router.patch(
      "/:id",
      validateBody(UpdateOrderDTO),
      this.orderController.updateOrder,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
