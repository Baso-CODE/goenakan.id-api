import { ProductUrlChangeStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { ProductUrlApprovalService } from "./product-url-approval.service";

@injectable()
export class ProductUrlApprovalController {
  constructor(private readonly service: ProductUrlApprovalService) {}

  private getUserId(req: Request): string {
    const user = (req as any).user;

    const userId = user?.id ?? user?.userId;

    if (typeof userId !== "string" || !userId) {
      throw new ApiError("Session pengguna tidak valid", 401);
    }

    return userId;
  }

  requestChange = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = this.getUserId(req);

      const result = await this.service.requestChange(
        String(req.params.productId),
        userId,
        req.body,
      );

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  getRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = req.query.status;

      if (
        status !== undefined &&
        (typeof status !== "string" ||
          !Object.values(ProductUrlChangeStatus).includes(
            status as ProductUrlChangeStatus,
          ))
      ) {
        throw new ApiError("Status approval tidak valid", 400);
      }

      const result = await this.service.getRequests(
        status as ProductUrlChangeStatus | undefined,
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = this.getUserId(req);

      const result = await this.service.approve(
        String(req.params.id),
        userId,
        req.body,
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = this.getUserId(req);

      const result = await this.service.reject(
        String(req.params.id),
        userId,
        req.body,
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
