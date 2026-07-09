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

  // === 0. CREATE NEW ORDER ===
  createOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Ambil data dari frontend
      // (Isinya form alamat, items/keranjang, subtotal, totalAmount, dll)
      const orderData = req.body;

      // 2. Cek apakah ada user yang sedang login (opsional)
      const user = (req as any).user;
      let profileId = null;

      if (user && user.id) {
        const profile = await this.getOrCreateProfile(user.id);
        profileId = profile.id;
      }

      // 3. Panggil Service untuk menyimpan pesanan ke database Prisma
      const newOrder = await this.orderService.createOrder(
        orderData,
        profileId,
      );

      // 4. Kembalikan respons sukses berformat JSON
      res.status(201).json({
        success: true,
        message: "Pesanan berhasil dibuat",
        data: newOrder,
      });
    } catch (error) {
      next(error);
    }
  };

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
      const { orderId } = req.params;

      // Ambil user jika ada (untuk user yang sedang login)
      const user = (req as any).user;
      let profileId = null;

      // Cek apakah user mengirimkan token yang valid
      if (user && user.id) {
        const profile = await this.getOrCreateProfile(user.id);
        profileId = profile.id;
      }

      // ✨ PERBAIKAN: Service harus diubah agar bisa menerima profileId null (untuk guest).
      // Atau, yang lebih baik, service getOrderDetail HANYA perlu mencari berdasarkan orderId saja.
      const order = await this.orderService.getOrderDetail(profileId, orderId);

      // Proteksi tambahan:
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Pesanan tidak ditemukan",
        });
      }

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

  // === 4. CREATE PAYMENT (MIDTRANS) ===
  createPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.params;

      const user = (req as any).user;

      if (user && user.id) {
        await this.getOrCreateProfile(user.id);
      }

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

  // === 5. MIDTRANS WEBHOOK RECEIVER ===
  midtransWebhook = async (req: Request, res: Response) => {
    try {
      await this.orderService.handleMidtransNotification(req.body);

      res.status(200).json({ status: "ok" });
    } catch (error) {
      console.error("Webhook Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
}
