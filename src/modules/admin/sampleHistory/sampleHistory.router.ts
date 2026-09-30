import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { SampleHistoryController } from "./sampleHistory.controller";

@autoInjectable()
export class SampleHistoryRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly sampleHistoryController: SampleHistoryController,
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
    this.router.use(autoVerifyPermission("sample_history"));

    // ==========================================
    // === SAMPLE HISTORY ROUTES ===
    // ==========================================

    // 1. Get All Sample History
    // Endpoint: GET /api/sample-history/
    this.router.get("/", this.sampleHistoryController.getAllHistory);

    // 2. Get Sample Summary
    // Endpoint: GET /api/sample-history/summary
    this.router.get("/summary", this.sampleHistoryController.getSummary);

    // ==========================================
    // === NEW PRODUCT SAMPLE ROUTES ===
    // ==========================================

    // 3. Get All Sample Products (List produk untuk halaman awal)
    // Endpoint: GET /api/sample-history/products
    this.router.get(
      "/products",
      this.sampleHistoryController.getAllSampleProducts,
    );

    // 4. Get Product Sample Detail (Detail SKU, History, & Summary)
    // Endpoint: GET /api/sample-history/products/:productId
    this.router.get(
      "/products/:productId",
      this.sampleHistoryController.getProductSampleDetail,
    );

    // ==========================================
    // === DYNAMIC ROUTES (Letakkan di bawah) ===
    // ==========================================

    // 5. Get History By ID (Melihat detail 1 riwayat history)
    // Endpoint: GET /api/sample-history/:id
    this.router.get("/:id", this.sampleHistoryController.getHistoryById);

    // 6. Mark Sample as Returned (Mengubah status sampel menjadi RETURNED)
    // Endpoint: POST /api/sample-history/:orderId/return
    this.router.post(
      "/:orderId/return",
      this.sampleHistoryController.markAsReturned,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
