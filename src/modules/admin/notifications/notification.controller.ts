import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { AdminNotificationService } from "./notification.service";

@injectable()
export class AdminNotificationController {
  constructor(private readonly service: AdminNotificationService) {}

  private getUserId(req: Request): string {
    const user = (req as any).user;
    const userId = user?.id ?? user?.userId;

    if (typeof userId !== "string" || !userId.trim()) {
      throw new ApiError("Sesi pengguna tidak valid", 401);
    }

    return userId;
  }

  getMyNotifications = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const userId = this.getUserId(req);

      const page = Number(req.query.page ?? 1);
      const take = Number(req.query.take ?? 20);

      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(take) ||
        take < 1
      ) {
        throw new ApiError("Parameter pagination tidak valid", 400);
      }

      const unreadOnly = req.query.unreadOnly === "true";

      const result = await this.service.getMyNotifications(
        userId,
        page,
        take,
        unreadOnly,
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getUnreadCount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = this.getUserId(req);

      const result = await this.service.getUnreadCount(userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  markAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = this.getUserId(req);

      const result = await this.service.markAsRead(
        userId,
        String(req.params.id),
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = this.getUserId(req);

      const result = await this.service.markAllAsRead(userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
