// src/modules/web-order/web-order.service.ts
import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { PrismaService } from "../../prisma/prisma.service";
import { OrderQueryDTO } from "./dto/web-order.dto";

@injectable()
export class WebOrderService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyOrders(profileId: string, query: OrderQueryDTO) {
    const { status } = query;

    return this.prisma.webOrder.findMany({
      where: {
        profileId: profileId,
        ...(status && { status: status }),
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                images: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async getOrderDetail(profileId: string, orderId: string) {
    const order = await this.prisma.webOrder.findFirst({
      where: {
        id: orderId,
        profileId: profileId,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new ApiError("Order tidak ditemukan atau bukan milik Anda", 404);
    }

    return order;
  }
  async cancelOrder(profileId: string, orderId: string, reason: string) {
    const order = await this.prisma.webOrder.findFirst({
      where: {
        id: orderId,
        profileId: profileId,
      },
    });

    if (!order) {
      throw new ApiError("Order tidak ditemukan", 404);
    }

    // Validasi: Pesanan yang sudah diproses atau dikirim tidak boleh dibatalkan sendiri oleh user
    const allowedStatus = ["PENDING", "PENDING_PAYMENT"];
    if (!allowedStatus.includes(order.status)) {
      throw new ApiError(
        "Pesanan sudah diproses dan tidak dapat dibatalkan",
        400,
      );
    }

    return this.prisma.webOrder.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        canceledReason: reason,
      },
    });
  }
}
