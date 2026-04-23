// src/modules/web-order/web-order.controller.ts
import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { WebOrderService } from "./web-order.service";

@injectable()
export class WebOrderController {
  constructor(
    private readonly orderService: WebOrderService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * HELPER: Memastikan profile tersedia berdasarkan User ID dari token
   */
  private async getOrCreateProfile(userId: string) {
    let profile = await this.prisma.customerProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      profile = await this.prisma.customerProfile.create({
        data: {
          userId,
          accountType: "INDIVIDUAL",
        },
      });
    }

    return profile;
  }

  // === 1. GET ALL MY ORDERS ===
  getMyOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profile = await this.getOrCreateProfile(userId);

      // Mengirim query params (seperti status) ke service
      const orders = await this.orderService.getMyOrders(profile.id, req.query);

      res.status(200).json({
        success: true,
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  };

  // === 2. GET ORDER DETAIL ===
  getOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profile = await this.getOrCreateProfile(userId);
      const { orderId } = req.params;

      const order = await this.orderService.getOrderDetail(profile.id, orderId);

      res.status(200).json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  };

  // === 3. CANCEL ORDER ===
  cancelMyOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const profile = await this.getOrCreateProfile(userId);
      const { orderId } = req.params;
      const { reason } = req.body;

      const result = await this.orderService.cancelOrder(
        profile.id,
        orderId,
        reason,
      );

      res.status(200).json({
        success: true,
        data: result,
        message: "Pesanan berhasil dibatalkan",
      });
    } catch (error) {
      next(error);
    }
  };
}
