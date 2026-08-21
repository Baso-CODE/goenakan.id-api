import { Router } from "express";
import { injectable } from "tsyringe";
import { TrackingController } from "./tracking.controller";

@injectable()
export class TrackingRouter {
  private readonly router: Router = Router();

  constructor(private readonly trackingController: TrackingController) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Endpoint Publik: POST /api/public/tracking
    this.router.post("/", this.trackingController.trackOrder);
  };

  getRouter(): Router {
    return this.router;
  }
}
