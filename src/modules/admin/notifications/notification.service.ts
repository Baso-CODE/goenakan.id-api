import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { PrismaService } from "../../prisma/prisma.service";

@injectable()
export class AdminNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // GET MY NOTIFICATIONS
  // ==========================================

  async getMyNotifications(
    userId: string,
    page = 1,
    take = 20,
    unreadOnly = false,
  ) {
    const safePage = Math.max(1, Math.floor(page));
    const safeTake = Math.min(100, Math.max(1, Math.floor(take)));

    const where = {
      userId,
      ...(unreadOnly && { isRead: false }),
    };

    const [data, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.adminNotification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (safePage - 1) * safeTake,
        take: safeTake,
      }),

      this.prisma.adminNotification.count({
        where,
      }),

      this.prisma.adminNotification.count({
        where: {
          userId,
          isRead: false,
        },
      }),
    ]);

    return {
      data,
      meta: {
        page: safePage,
        take: safeTake,
        total,
        totalPages: Math.ceil(total / safeTake),
        unreadCount,
      },
    };
  }

  // ==========================================
  // GET UNREAD COUNT
  // ==========================================

  async getUnreadCount(userId: string) {
    const unreadCount = await this.prisma.adminNotification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return { unreadCount };
  }

  // ==========================================
  // MARK ONE NOTIFICATION AS READ
  // ==========================================

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.adminNotification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new ApiError("Notifikasi tidak ditemukan", 404);
    }

    if (!notification.isRead) {
      await this.prisma.adminNotification.updateMany({
        where: {
          id: notificationId,
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
    }

    return {
      message: "Notifikasi ditandai sudah dibaca",
    };
  }

  // ==========================================
  // MARK ALL NOTIFICATIONS AS READ
  // ==========================================

  async markAllAsRead(userId: string) {
    const result = await this.prisma.adminNotification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      message: "Semua notifikasi ditandai sudah dibaca",
      updatedCount: result.count,
    };
  }
}
