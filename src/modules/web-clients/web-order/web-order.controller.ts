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

  // =====================================================
  // HELPER: GET OR CREATE CUSTOMER PROFILE
  // =====================================================
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

  // =====================================================
  // HELPER: RESOLVE CUSTOMER PROFILE
  // =====================================================
  private async resolveProfileId(req: Request): Promise<string | null> {
    const user = (req as any).user;

    if (!user?.id) {
      return null;
    }

    const profile = await this.getOrCreateProfile(user.id);

    return profile.id;
  }

  // =====================================================
  // HELPER: GET GUEST ORDER ACCESS TOKEN
  // =====================================================
  private getGuestOrderToken(req: Request): string | undefined {
    const token = req.headers["x-guest-order-token"];

    if (typeof token !== "string") {
      return undefined;
    }

    const normalized = token.trim();

    return normalized || undefined;
  }

  // =====================================================
  // 0. CREATE NEW ORDER
  // Guest checkout tetap diperbolehkan
  // =====================================================
  createOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orderData = req.body;

      const profileId = await this.resolveProfileId(req);

      const newOrder = await this.orderService.createOrder(
        orderData,
        profileId,
      );

      res.status(201).json({
        success: true,
        message: "Pesanan berhasil dibuat",
        data: newOrder,
      });
    } catch (error) {
      next(error);
    }
  };

  // =====================================================
  // 1. GET MY ORDERS
  // Wajib login melalui middleware router
  // =====================================================
  getMyOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;

      if (!user?.id) {
        res.status(401).json({
          success: false,
          message: "Silakan login terlebih dahulu",
        });
        return;
      }

      const profile = await this.getOrCreateProfile(user.id);

      const orders = await this.orderService.getMyOrders(profile.id, req.query);

      res.status(200).json({
        success: true,
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  };

  // =====================================================
  // 2. GET ORDER DETAIL
  // Login    -> verifikasi profileId
  // Guest    -> verifikasi guest order token
  // =====================================================
  getOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.params;

      const profileId = await this.resolveProfileId(req);

      const guestToken = this.getGuestOrderToken(req);

      // WAJIB verifikasi akses sebelum mengambil detail
      await this.orderService.assertOrderAccess(orderId, profileId, guestToken);

      const order = await this.orderService.getOrderDetail(profileId, orderId);

      res.status(200).json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  };

  // =====================================================
  // 3. CANCEL MY ORDER
  // Wajib login dan kepemilikan profile
  // =====================================================
  cancelMyOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;

      if (!user?.id) {
        res.status(401).json({
          success: false,
          message: "Silakan login terlebih dahulu",
        });
        return;
      }

      const { orderId } = req.params;
      const { reason } = req.body;

      const profile = await this.getOrCreateProfile(user.id);

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

  // =====================================================
  // 4. CREATE PAYMENT (MIDTRANS)
  // Login    -> verifikasi profileId
  // Guest    -> verifikasi guest order token
  // =====================================================
  createPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.params;

      const profileId = await this.resolveProfileId(req);

      const guestToken = this.getGuestOrderToken(req);

      // Jangan izinkan akses pembayaran hanya dengan UUID order
      await this.orderService.assertOrderAccess(orderId, profileId, guestToken);

      const transaction = await this.orderService.createPayment(orderId);

      res.status(200).json({
        success: true,
        message: "Token pembayaran berhasil dibuat",
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  };

  // =====================================================
  // 5. MIDTRANS WEBHOOK
  // Tidak membutuhkan guest token / session customer
  // Validasi notifikasi dilakukan oleh Midtrans SDK
  // =====================================================
  midtransWebhook = async (req: Request, res: Response) => {
    try {
      await this.orderService.handleMidtransNotification(req.body);

      res.status(200).json({
        status: "ok",
      });
    } catch (error) {
      console.error("[MIDTRANS WEBHOOK ERROR]", error);

      res.status(500).json({
        error: "Internal Server Error",
      });
    }
  };
}
