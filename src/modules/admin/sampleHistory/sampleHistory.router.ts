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
    this.router.use(autoVerifyPermission());

    // ==========================================
    // === SAMPLE HISTORY ROUTES ===
    // ==========================================

    // 1. Get All Sample History (Otomatis butuh izin 'read')
    // Endpoint: GET /api/sample-history/
    this.router.get("/", this.sampleHistoryController.getAllHistory);

    // 2. Get Sample Summary (Otomatis butuh izin 'read')
    // Endpoint: GET /api/sample-history/summary
    this.router.get("/summary", this.sampleHistoryController.getSummary);

    this.router.get("/:id", this.sampleHistoryController.getHistoryById);

    // 3. Mark Sample as Returned (Otomatis butuh izin 'update' atau 'create')
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
