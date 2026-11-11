import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { AdminNotificationController } from "./notification.controller";

@autoInjectable()
export class AdminNotificationRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly controller: AdminNotificationController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);

    this.router.get("/", this.controller.getMyNotifications);

    this.router.get("/unread-count", this.controller.getUnreadCount);

    this.router.patch("/read-all", this.controller.markAllAsRead);

    this.router.patch("/:id/read", this.controller.markAsRead);
  }

  getRouter(): Router {
    return this.router;
  }
}
