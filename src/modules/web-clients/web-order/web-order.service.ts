// src/modules/web-order/web-order.service.ts
import { WebOrderStatus } from "@prisma/client";
import { injectable } from "tsyringe";
import { coreApi, snap } from "../../../lib/midtrans";
import { ApiError } from "../../../utils/api-error";
import { PrismaService } from "../../prisma/prisma.service";

@injectable()
export class WebOrderService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyOrders(profileId: string, query: any) {
    const { status } = query;

    return this.prisma.webOrder.findMany({
      where: {
        profileId: profileId,
        ...(status && { status: status as WebOrderStatus }),
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

    // Status yang diizinkan untuk dibatalkan
    const allowedStatus: WebOrderStatus[] = ["PENDING_PAYMENT"];
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

  async createPayment(orderId: string) {
    const order = await this.prisma.webOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new ApiError("Order tidak ditemukan", 404);
    }

    if (order.status !== "PENDING_PAYMENT") {
      throw new ApiError("Order ini tidak membutuhkan pembayaran", 400);
    }

    // 2. Siapkan array item_details dari keranjang belanja
    const itemDetails = order.items.map((item) => ({
      id: item.productId,
      price: Math.round(Number(item.price)),
      quantity: item.quantity,
      name: item.productName.substring(0, 50),
    }));

    // ✨ PERBAIKAN: Masukkan Ongkos Kirim sebagai "Item" agar hitungan Midtrans seimbang
    if (order.shippingCost && Number(order.shippingCost) > 0) {
      itemDetails.push({
        id: "SHIPPING-FEE",
        price: Math.round(Number(order.shippingCost)),
        quantity: 1,
        name: "Ongkos Kirim",
      });
    }

    // ✨ PERBAIKAN: Masukkan Pajak (Tax) jika nantinya kamu menggunakannya
    if (order.taxAmount && Number(order.taxAmount) > 0) {
      itemDetails.push({
        id: "TAX-FEE",
        price: Math.round(Number(order.taxAmount)),
        quantity: 1,
        name: "Pajak PPN",
      });
    }

    // 3. Siapkan parameter akhir untuk Midtrans
    const parameter = {
      transaction_details: {
        order_id: order.orderNumber,
        gross_amount: Math.round(Number(order.totalAmount)), // Harus persis sama dengan total semua itemDetails
      },
      item_details: itemDetails,
      customer_details: {
        first_name: order.guestName || "Customer",
        email: order.guestEmail || undefined,
        phone: order.guestPhone || undefined,
      },
    };

    try {
      // 4. Minta token ke Midtrans
      const transaction = await snap.createTransaction(parameter);

      // 5. Update WebOrder dengan paymentUrl
      await this.prisma.webOrder.update({
        where: { id: orderId },
        data: { paymentUrl: transaction.redirect_url },
      });

      return transaction;
    } catch (error: any) {
      // ✨ Logging tambahan untuk melihat error asli dari Midtrans di terminal backend-mu
      console.error(
        ">>> ERROR MIDTRANS ASLI:",
        error?.ApiResponse || error.message,
      );

      throw new ApiError(
        "Gagal membuat transaksi ke Midtrans. Cek log server.",
        500,
      );
    }
  }

  // === CREATE NEW ORDER ===
  async createOrder(data: any, profileId: string | null) {
    const { form, items, note, subtotal, shippingCost, totalAmount } = data;
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 100)}`;

    const newOrder = await this.prisma.webOrder.create({
      data: {
        orderNumber: orderNumber,
        profileId: profileId,

        // Data Tamu / Pembeli
        guestName: form.fullName,
        guestEmail: form.email,
        guestPhone: form.phone,

        shippingAddress: {
          country: form.country,
          city: form.city,
          address: form.address,
          customerNote: note || "",
        },

        // Data Keuangan
        subtotal: subtotal,
        shippingCost: shippingCost,
        totalAmount: totalAmount,
        status: "PENDING_PAYMENT",
        items: {
          create: items.map((item: any) => ({
            productId: item.productId || item.id,
            variantId: item.variantId || null,
            productName: item.name,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
            customization: item.customization || null,
          })),
        },
      },
    });

    return newOrder;
  }

  // === 5. HANDLE MIDTRANS WEBHOOK / NOTIFICATION ===
  async handleMidtransNotification(notificationRaw: any) {
    try {
      const statusResponse = await (coreApi as any).transaction.notification(
        notificationRaw,
      );
      const orderId = statusResponse.order_id;
      const transactionStatus = statusResponse.transaction_status;
      const fraudStatus = statusResponse.fraud_status;

      let newStatus: WebOrderStatus | undefined;

      if (
        transactionStatus === "capture" ||
        transactionStatus === "settlement"
      ) {
        if (fraudStatus === "accept" || !fraudStatus) {
          newStatus = "PAID";
        }
      } else if (
        transactionStatus === "cancel" ||
        transactionStatus === "deny" ||
        transactionStatus === "expire"
      ) {
        newStatus = "CANCELLED";
      } else if (transactionStatus === "pending") {
        newStatus = "PENDING_PAYMENT";
      }

      if (newStatus) {
        await this.prisma.webOrder.update({
          where: { orderNumber: orderId },
          data: { status: newStatus },
        });
      }

      return { success: true };
    } catch (error) {
      console.error("Gagal memproses Webhook Midtrans:", error);
      throw new Error("Gagal memproses notifikasi");
    }
  }
}
