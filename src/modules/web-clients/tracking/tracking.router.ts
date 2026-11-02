import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { injectable } from "tsyringe";
import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { TrackingController } from "./tracking.controller";

// ==========================================
// RATE LIMIT - PUBLIC WHATSAPP TRACKING
// ==========================================

const whatsappClickLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    success: false,
    message: "Terlalu banyak request. Silakan coba lagi nanti.",
  },
});

@injectable()
export class TrackingRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly trackingController: TrackingController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // ==========================================
    // WHATSAPP ATTRIBUTION TRACKING
    // POST /tracking/whatsapp-click
    // ==========================================

    this.router.post(
      "/whatsapp-click",
      whatsappClickLimiter,
      this.trackingController.createWhatsappClick,
    );

    // ==========================================
    // ADMIN - WHATSAPP CODE MATCHING
    // ==========================================

    this.router.patch(
      "/whatsapp-click/match/lead",
      this.nextAuthMiddleware.verifyNextAuthToken,
      autoVerifyPermission("contact_message", "update"),
      (req, res, next) => {
        req.params.targetType = "lead";
        return this.trackingController.matchWhatsappClick(req, res, next);
      },
    );

    this.router.patch(
      "/whatsapp-click/match/quotation",
      this.nextAuthMiddleware.verifyNextAuthToken,
      autoVerifyPermission("quotation", "update"),
      (req, res, next) => {
        req.params.targetType = "quotation";
        return this.trackingController.matchWhatsappClick(req, res, next);
      },
    );

    this.router.patch(
      "/whatsapp-click/match/order",
      this.nextAuthMiddleware.verifyNextAuthToken,
      autoVerifyPermission("order", "update"),
      (req, res, next) => {
        req.params.targetType = "order";
        return this.trackingController.matchWhatsappClick(req, res, next);
      },
    );

    // ==========================================
    // EXISTING ORDER TRACKING
    // POST /tracking
    // ==========================================

    this.router.post("/", this.trackingController.trackOrder);
  };

  getRouter(): Router {
    return this.router;
  }
}
