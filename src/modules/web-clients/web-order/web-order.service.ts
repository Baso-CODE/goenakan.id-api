// src/modules/web-order/web-order.service.ts
import { ClientType, SalesCategory, WebOrderStatus } from "@prisma/client";
import { injectable } from "tsyringe";
import { coreApi, snap } from "../../../lib/midtrans";
import { ApiError } from "../../../utils/api-error";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateWebOrderDTO } from "./dto/web-order.dto";

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
        items: {
          include: {
            product: {
              include: {
                images: {
                  // where: { isFeatured: true },
                  take: 1,
                },
                materialType: true,
              },
            },
            variant: {
              include: {
                images: {
                  // where: { isFeatured: true },
                  take: 1,
                },
                attributeValues: {
                  include: {
                    attributeValue: {
                      include: {
                        attribute: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
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

    const itemDetails = order.items.map((item) => ({
      id: item.productId,
      price: Math.round(Number(item.price)),
      quantity: item.quantity,
      name: item.productName.substring(0, 50),
    }));

    if (order.shippingCost && Number(order.shippingCost) > 0) {
      itemDetails.push({
        id: "SHIPPING-FEE",
        price: Math.round(Number(order.shippingCost)),
        quantity: 1,
        name: "Ongkos Kirim",
      });
    }

    if (order.taxAmount && Number(order.taxAmount) > 0) {
      itemDetails.push({
        id: "TAX-FEE",
        price: Math.round(Number(order.taxAmount)),
        quantity: 1,
        name: "Pajak PPN",
      });
    }

    const midtransOrderId = `${order.orderNumber}_${Date.now()}`;

    const parameter = {
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: Math.round(Number(order.totalAmount)),
      },
      item_details: itemDetails,
      customer_details: {
        first_name: order.guestName || "Customer",
        email: order.guestEmail || undefined,
        phone: order.guestPhone || undefined,
      },
    };

    try {
      const transaction = await snap.createTransaction(parameter);

      await this.prisma.webOrder.update({
        where: { id: orderId },
        data: { paymentUrl: transaction.redirect_url },
      });

      return transaction;
    } catch (error: any) {
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
  async createOrder(data: CreateWebOrderDTO, profileId: string | null) {
    const { form, items, note, subtotal, shippingCost, totalAmount } = data;

    // Generate Order Number
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 100)}`;

    return await this.prisma.webOrder.create({
      data: {
        orderNumber: orderNumber,
        profileId: profileId,
        guestName: form.fullName,
        guestEmail: form.email,
        guestPhone: form.phone,
        customerNote: note || null,

        shippingAddress: {
          recipient: form.fullName,
          phone: form.phone,
          country: form.country,
          province: form.province,
          city: form.city,
          district: form.district,
          postalCode: form.postalCode,
          fullAddress: form.address,
        },

        subtotal: subtotal,
        shippingCost: shippingCost,
        totalAmount: totalAmount,
        status: "PENDING_PAYMENT",

        items: {
          create: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || null,
            productName: item.name,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
            customization: item.customization || null,
          })),
        },
      },
      include: {
        items: true,
      },
    });
  }

  // === 5. HANDLE MIDTRANS WEBHOOK / NOTIFICATION ===
  async handleMidtransNotification(notificationRaw: any) {
    try {
      const statusResponse = await (coreApi as any).transaction.notification(
        notificationRaw,
      );

      const rawOrderId = statusResponse.order_id;
      const transactionStatus = statusResponse.transaction_status;
      const fraudStatus = statusResponse.fraud_status;

      // Misal format order_id dari midtrans: ORD-12345_171000000
      const actualOrderNumber = rawOrderId.split("_")[0];
      const paymentMethodFromMidtrans = statusResponse.payment_type;

      let newStatus: WebOrderStatus | undefined;

      // 1. Tentukan Status Berdasarkan Notifikasi Midtrans
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

      // 2. Jalankan Proses Update Berdasarkan Status
      if (newStatus) {
        if (newStatus === "PAID") {
          // ==============================================================
          // 🌟 LOGIKA BARU: JIKA LUNAS, KONVERSI KE ORDER UTAMA & CLIENT
          // ==============================================================
          await this.processPaidWebOrder(
            actualOrderNumber,
            paymentMethodFromMidtrans,
          );
        } else {
          // Jika status selain PAID (misal CANCELLED/PENDING), update biasa saja
          await this.prisma.webOrder.update({
            where: { orderNumber: actualOrderNumber },
            data: {
              status: newStatus,
              paymentMethod: paymentMethodFromMidtrans,
            },
          });
        }
      }

      return { success: true };
    } catch (error) {
      console.error("🔥 Gagal memproses Webhook Midtrans:", error);
      throw new Error("Gagal memproses notifikasi");
    }
  }

  // =========================================================================
  // 🌟 FUNGSI BARU: PROSES KONVERSI KE SISTEM UTAMA (ORDER & CLIENT)
  // =========================================================================
  private async processPaidWebOrder(
    orderNumber: string,
    paymentMethod: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      // 1. Ambil Data Web Order secara lengkap
      const webOrder = await tx.webOrder.findUnique({
        where: { orderNumber },
        include: {
          profile: true,
          items: true,
        },
      });

      if (!webOrder) throw new Error("Web Order tidak ditemukan");
      // Mencegah konversi ganda jika webhook terkirim dua kali dari Midtrans
      if (webOrder.status === "PAID" || webOrder.status === "PROCESSING")
        return;

      // 2. Siapkan ID Client (Tentukan apakah B2C atau B2B)
      let clientIdToUse = "";

      const existingClient = webOrder.profile?.userId
        ? await tx.client.findFirst({
            where: { userId: webOrder.profile.userId },
          })
        : null;

      if (existingClient) {
        clientIdToUse = existingClient.id;
      } else {
        const isCorporate = webOrder.profile?.accountType === "CORPORATE";
        const clientType = isCorporate ? ClientType.B2B : ClientType.B2C;

        // Buat record utama di tabel Client
        const newClient = await tx.client.create({
          data: {
            custCode: `CUST-WEB-${Date.now()}`,
            type: clientType,
            userId: webOrder.profile?.userId || undefined,
          },
        });
        clientIdToUse = newClient.id;

        // Ambil Channel Website (Wajib ada di database)
        const webChannel = await tx.purchaseChannel.findUnique({
          where: { slug: "website" },
        });
        if (!webChannel)
          throw new Error(
            "Mohon buat data PurchaseChannel dengan slug 'website' di database!",
          );

        // Pisahkan penyimpanan B2B dan B2C
        if (isCorporate) {
          // Asumsi kamu punya data Department, kita ambil yang pertama sebagai default
          const defaultDept = await tx.department.findFirst();
          if (!defaultDept)
            throw new Error("Belum ada data Department di database untuk B2B!");

          await tx.clientB2B.create({
            data: {
              id: newClient.id,
              companyName: webOrder.profile?.companyName || "Perusahaan Web",
              departmentId: defaultDept.id,
              website: "-",
              phone: webOrder.profile?.picPhone || webOrder.guestPhone,
              fullAddress: JSON.stringify(webOrder.shippingAddress),
              purchaseChannelId: webChannel.id,
            },
          });
        } else {
          await tx.clientB2C.create({
            data: {
              id: newClient.id,
              prefix: "Mr/Ms",
              name: webOrder.guestName || "Guest",
              phone: webOrder.guestPhone,
              fullAddress: JSON.stringify(webOrder.shippingAddress),
              purchaseChannelId: webChannel.id,
            },
          });
        }
      }

      // 3. Ambil ID Purchase Channel untuk Order
      const websiteChannel = await tx.purchaseChannel.findUnique({
        where: { slug: "website" },
      });
      const totalOrders = await tx.order.count();
      const sequence = String(totalOrders + 1).padStart(4, "0");
      const generatedPoNumber = `GI-PO${sequence}`;
      // 4. Buat Order Utama di dalam ekosistem perusahaan
      await tx.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}`,
          dateOrder: new Date(),
          salesCategory: SalesCategory.SALES,
          poNumber: generatedPoNumber,
          clientId: clientIdToUse,
          purchaseChannelId: websiteChannel!.id,
          shippingAddress: JSON.stringify(webOrder.shippingAddress),
          totalAmount: webOrder.totalAmount,
          webOrderId: webOrder.id, // Sambungkan referensi order aslinya

          // Memindahkan barang belanjaan dari keranjang (WebOrderItem) ke OrderProduct
          products: {
            create: webOrder.items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPrice: item.price,
              customization: item.customization || undefined,
              remarks: item.notes,
            })),
          },
        },
      });

      // 5. Update Status WebOrder menjadi PAID
      await tx.webOrder.update({
        where: { id: webOrder.id },
        data: {
          status: "PAID",
          paymentMethod: paymentMethod,
        },
      });
    });
  }
}
