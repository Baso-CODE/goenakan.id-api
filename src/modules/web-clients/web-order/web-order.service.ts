// src/modules/web-order/web-order.service.ts
import { ClientType, SalesCategory, WebOrderStatus } from "@prisma/client";
import { injectable } from "tsyringe";
import { coreApi, snap } from "../../../lib/midtrans";
import { ApiError } from "../../../utils/api-error";
import { CounterService } from "../../../utils/counter.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateWebOrderDTO } from "./dto/web-order.dto";

@injectable()
export class WebOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly counterService: CounterService,
  ) {}

  // ====================================================================
  // HELPER: GENERATE ORDER NUMBER (Format: GI-SO260700001)
  // ====================================================================
  private async generateOrderNumber(
    tx: any,
    category: "SALES" | "SAMPLE",
  ): Promise<string> {
    const formCode = category === "SALES" ? "SO" : "SN";
    const periodYYMM = this.counterService.getCurrentPeriodYYMM();
    const counterType = `${formCode}_${periodYYMM}`;

    // Menggunakan CounterService untuk atomic increment yang aman dari race condition
    const sequence = await this.counterService.getNextFormattedNumber(
      tx,
      counterType,
      periodYYMM,
      5,
    );

    return `GI-${formCode}${periodYYMM}${sequence}`;
  }

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

  async getOrderDetail(profileId: string | null, orderId: string) {
    const order = await this.prisma.webOrder.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: {
                  take: 1,
                },
                materialType: true,
              },
            },
            variant: {
              include: {
                images: {
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
      throw new ApiError("Pesanan tidak ditemukan", 404);
    }

    if (profileId && order.profileId && order.profileId !== profileId) {
      throw new ApiError("Anda tidak memiliki akses ke pesanan ini", 403);
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

  // === CREATE NEW ORDER (VERSI FINAL & AMAN) ===
  async createOrder(data: CreateWebOrderDTO, profileId: string | null) {
    const { form, items, note, shippingCost } = data;

    let calculatedSubtotal = 0;
    const validatedItems = await Promise.all(
      items.map(async (item) => {
        let actualPrice = 0;
        let productName = item.name;

        // 1. Cek apakah item memiliki variantId (Varian Produk)
        if (item.variantId) {
          const dbVariant = await this.prisma.productVariant.findUnique({
            where: { id: item.variantId },
            include: { product: true },
          });

          if (!dbVariant) {
            throw new ApiError(
              `Varian produk dengan ID ${item.variantId} tidak ditemukan`,
              404,
            );
          }

          actualPrice = Number(dbVariant.price ?? dbVariant.product.basePrice);
          productName = `${dbVariant.product.name} - ${dbVariant.variantName || "Varian"}`;
        } else {
          const dbProduct = await this.prisma.product.findUnique({
            where: { id: item.productId },
          });

          if (!dbProduct) {
            throw new ApiError(
              `Produk dengan ID ${item.productId} tidak ditemukan`,
              404,
            );
          }

          actualPrice = Number(dbProduct.basePrice);
          productName = dbProduct.name;
        }

        // 2. Hitung tambahan harga dari Customization (Logo/Sablon)
        let customizationPriceAddition = 0;
        let parsedCustomization: any = null;

        if (item.customization) {
          try {
            parsedCustomization =
              typeof item.customization === "string"
                ? JSON.parse(item.customization)
                : item.customization;

            if (parsedCustomization && parsedCustomization.zones) {
              Object.values(parsedCustomization.zones).forEach((zone: any) => {
                const count = zone.logoCount || 1;
                customizationPriceAddition += count * 10000;
              });
            }
          } catch (e) {
            console.error(
              "Gagal parse customization untuk perhitungan harga",
              e,
            );
          }
        }

        const finalItemPrice = actualPrice + customizationPriceAddition;
        const actualTotalItem = finalItemPrice * item.quantity;

        calculatedSubtotal += actualTotalItem;

        // 3. Kembalikan objek item yang sesuai dengan tipe Json Prisma
        return {
          productName: productName,
          quantity: item.quantity,
          price: finalItemPrice,
          total: actualTotalItem,
          // ✨ PASTIKAN BERBENTUK OBJECT / NULL AGAR SESUAI DENGAN TIPE JSON PRISMA ✨
          customization: parsedCustomization,

          product: {
            connect: { id: item.productId },
          },
          ...(item.variantId && {
            variant: {
              connect: { id: item.variantId },
            },
          }),
        };
      }),
    );

    // 4. Hitung Total Keseluruhan (Subtotal + Ongkir) di Backend secara aman
    const actualShippingCost = shippingCost || 0;
    const calculatedTotalAmount = calculatedSubtotal + actualShippingCost;

    // 5. Generate Order Number menggunakan Transaction
    const orderNumber = await this.prisma.$transaction(async (tx) => {
      return await this.generateOrderNumber(tx, "SALES");
    });

    // 6. Simpan ke Database
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

        subtotal: calculatedSubtotal,
        shippingCost: actualShippingCost,
        totalAmount: calculatedTotalAmount,
        status: "PENDING_PAYMENT",

        items: {
          create: validatedItems,
        },
      },
      include: {
        items: true,
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
    // Memberikan batas visual yang jelas di terminal saat proses dimulai
    console.log(
      `\n🚀 [WEBHOOK START] Memulai proses konversi Web Order: ${orderNumber}`,
    );
    console.log(`💳 Metode Pembayaran: ${paymentMethod}`);

    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Ambil Data Web Order secara lengkap
        console.log("🔍 [STEP 1] Mencari data Web Order di database...");
        const webOrder = await tx.webOrder.findUnique({
          where: { orderNumber },
          include: {
            profile: true,
            items: true,
          },
        });

        if (!webOrder) {
          console.error("❌ [ERROR] Web Order tidak ditemukan!");
          throw new Error("Web Order tidak ditemukan");
        }

        if (webOrder.status === "PAID" || webOrder.status === "PROCESSING") {
          console.log(
            `⚠️ [INFO] Web Order sudah berstatus ${webOrder.status}. Proses dihentikan agar tidak duplikat.`,
          );
          return;
        }
        console.log(
          `✅ Web Order ditemukan! Jumlah produk: ${webOrder.items.length} item.`,
        );

        // ✨ OPTIMASI: Ambil Data Channel satu kali saja di awal
        console.log("🔍 [STEP 2] Memeriksa Purchase Channel 'website'...");
        const webChannel = await tx.purchaseChannel.findUnique({
          where: { slug: "website" },
        });
        if (!webChannel) {
          console.error(
            "❌ [ERROR] PurchaseChannel dengan slug 'website' belum ada!",
          );
          throw new Error(
            "Mohon buat data PurchaseChannel dengan slug 'website'!",
          );
        }
        console.log("✅ Purchase Channel 'website' siap digunakan.");

        // 2. Siapkan ID Client
        console.log("🔍 [STEP 3] Menyiapkan data Pelanggan (Client)...");
        let clientIdToUse = "";
        const existingClient = webOrder.profile?.userId
          ? await tx.client.findFirst({
              where: { userId: webOrder.profile.userId },
            })
          : null;

        if (existingClient) {
          clientIdToUse = existingClient.id;
          console.log(
            `👤 Pelanggan lama ditemukan (ID: ${clientIdToUse}). Menggunakan data yang sudah ada.`,
          );
        } else {
          console.log(
            "👤 Pelanggan lama tidak ditemukan. Membuat profil Pelanggan baru...",
          );
          const isCorporate = webOrder.profile?.accountType === "CORPORATE";
          const clientType = isCorporate ? ClientType.B2B : ClientType.B2C;

          const newClient = await tx.client.create({
            data: {
              custCode: `CUST-WEB-${Date.now()}`,
              type: clientType,
              userId: webOrder.profile?.userId || undefined,
            },
          });
          clientIdToUse = newClient.id;

          if (isCorporate) {
            console.log(`🏢 Mendaftarkan profil sebagai Perusahaan (B2B)...`);
            const defaultDept = await tx.department.findFirst();
            if (!defaultDept) {
              console.error(
                "❌ [ERROR] Data Department belum ada di database!",
              );
              throw new Error("Belum ada data Department!");
            }
            await tx.clientB2B.create({
              data: {
                id: newClient.id,
                companyName: webOrder.profile?.companyName || "Perusahaan Web",
                departmentId: defaultDept.id,
                website: "-",
                phone: webOrder.profile?.picPhone || webOrder.guestPhone,
                fullAddress: JSON.stringify(webOrder.shippingAddress),
              },
            });
          } else {
            console.log(`🧑 Mendaftarkan profil sebagai Personal (B2C)...`);
            await tx.clientB2C.create({
              data: {
                id: newClient.id,
                prefix: "Mr/Ms",
                name: webOrder.guestName || "Guest",
                phone: webOrder.guestPhone,
                fullAddress: JSON.stringify(webOrder.shippingAddress),
              },
            });
          }
          console.log(
            `✅ Profil Pelanggan berhasil dibuat (ID: ${clientIdToUse}).`,
          );
        }

        // 3. Generate Nomor Order & Buat Order Utama
        console.log("📝 [STEP 4] Membuat Nomor Pesanan (Order Number) baru...");
        // 3. ✨ PERBAIKAN: Gunakan nomor order yang sudah ada dari WebOrder (Bukan generate baru!)
        const generatedOrderNumber = webOrder.orderNumber;
        console.log(
          `✅ Menggunakan Nomor Order yang sama: ${generatedOrderNumber}`,
        );

        console.log("📦 Menyimpan Order Utama ke database...");
        await tx.order.create({
          data: {
            orderNumber: generatedOrderNumber, // Konsisten dengan WebOrder!
            dateOrder: new Date(),
            salesCategory: SalesCategory.SALES,
            clientId: clientIdToUse,
            purchaseChannelId: webChannel.id,
            shippingAddress: JSON.stringify(webOrder.shippingAddress),
            totalAmount: webOrder.totalAmount,
            webOrderId: webOrder.id,

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
        console.log("✅ Order Utama berhasil disimpan!");

        // 4. Update Status WebOrder menjadi PAID
        console.log("🔄 [STEP 5] Memperbarui status Web Order menjadi PAID...");
        await tx.webOrder.update({
          where: { id: webOrder.id },
          data: {
            status: "PAID",
            paymentMethod: paymentMethod,
          },
        });

        console.log(
          `🎉 [WEBHOOK SUCCESS] Seluruh proses untuk ${orderNumber} berhasil diselesaikan!\n`,
        );
      });
    } catch (error) {
      // Menangkap dan menampilkan error yang terjadi selama transaksi
      console.error(
        `🚨 [WEBHOOK FAILED] Terjadi kesalahan saat memproses Order ${orderNumber}:`,
      );
      console.error(error);
      console.log(
        "⚠️ Transaksi dibatalkan (Rollback). Tidak ada data yang tersimpan sebagian.\n",
      );
      throw error;
    }
  }
}
