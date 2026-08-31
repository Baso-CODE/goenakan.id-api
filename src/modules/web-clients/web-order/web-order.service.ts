import { ClientType, SalesCategory, WebOrderStatus } from "@prisma/client";
import { injectable } from "tsyringe";
import { coreApi, snap } from "../../../lib/midtrans";
import { ApiError } from "../../../utils/api-error";
import { CounterService } from "../../../utils/counter.service";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../auth-client/email.service";
import { CreateWebOrderDTO } from "./dto/web-order.dto";

@injectable()
export class WebOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly counterService: CounterService,
    private readonly emailService: EmailService,
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

  // === CREATE NEW ORDER (DENGAN KALKULASI TIER & PRICE MODIFIER ATRIBUT TEKS) ===
  async createOrder(data: CreateWebOrderDTO, profileId: string | null) {
    const { form, items, note, shippingCost } = data;

    let calculatedSubtotal = 0;
    const validatedItems = await Promise.all(
      items.map(async (item: any, index: number) => {
        const dbProduct = await this.prisma.product.findUnique({
          where: { id: item.productId },
          include: { priceTiers: { orderBy: { minQuantity: "desc" } } },
        });

        if (!dbProduct) {
          throw new ApiError(
            `Produk dengan ID ${item.productId} tidak ditemukan`,
            404,
          );
        }

        let actualPrice = Number(dbProduct.basePrice);
        let productName = dbProduct.name;
        let activeTiers: any[] = dbProduct.priceTiers || [];

        if (item.variantId) {
          const dbVariant = await this.prisma.productVariant.findUnique({
            where: { id: item.variantId },
            include: { priceTiers: { orderBy: { minQuantity: "desc" } } },
          });

          if (!dbVariant) {
            throw new ApiError(
              `Varian produk dengan ID ${item.variantId} tidak ditemukan`,
              404,
            );
          }

          actualPrice = Number(dbVariant.price ?? actualPrice);
          productName = `${dbProduct.name} - ${dbVariant.variantName || "Varian"}`;

          if (dbVariant.priceTiers && dbVariant.priceTiers.length > 0) {
            activeTiers = dbVariant.priceTiers;
          } else if (activeTiers.length > 0 && dbVariant.price) {
            const diff = Number(dbVariant.price) - Number(dbProduct.basePrice);
            activeTiers = activeTiers.map((t) => ({
              ...t,
              price: Number(t.price) + diff,
            }));
          }
        }

        const matchedTier = activeTiers.find(
          (tier) => item.quantity >= tier.minQuantity,
        );
        if (matchedTier) {
          actualPrice = Number(matchedTier.price);
        }

        let parsedSelectedAttributes: any = null;
        let attributePriceAddition = 0;

        if (item.selectedAttributes) {
          try {
            parsedSelectedAttributes =
              typeof item.selectedAttributes === "string"
                ? JSON.parse(item.selectedAttributes)
                : item.selectedAttributes;

            if (
              parsedSelectedAttributes &&
              typeof parsedSelectedAttributes === "object"
            ) {
              const attrEntries = Object.entries(parsedSelectedAttributes);

              for (const [attrName, attrValue] of attrEntries) {
                if (!attrValue) continue;

                const dbAttrValue =
                  await this.prisma.productAttributeValue.findFirst({
                    where: {
                      productId: item.productId,
                      attribute: {
                        name: { equals: attrName },
                      },
                      attributeValue: {
                        value: {
                          contains: attrValue as string,
                        },
                      },
                    },
                  });

                if (dbAttrValue) {
                  attributePriceAddition += dbAttrValue.priceModifier
                    ? Number(dbAttrValue.priceModifier)
                    : 0;
                }
              }
            }
          } catch (e) {
            console.error(
              "Gagal memparsing/menghitung priceModifier selectedAttributes",
              e,
            );
          }
        }

        const finalItemPrice = actualPrice + attributePriceAddition;
        const actualTotalItem = finalItemPrice * item.quantity;

        calculatedSubtotal += actualTotalItem;

        let parsedCustomization: any = null;
        if (item.customization) {
          try {
            parsedCustomization =
              typeof item.customization === "string"
                ? JSON.parse(item.customization)
                : item.customization;
          } catch (e) {}
        }

        return {
          productName: productName,
          quantity: item.quantity,
          price: finalItemPrice,
          total: actualTotalItem,
          customization: parsedCustomization,
          selectedAttributes: parsedSelectedAttributes,

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

    const actualShippingCost = shippingCost || 0;
    const calculatedTotalAmount = calculatedSubtotal + actualShippingCost;

    const orderNumber = await this.prisma.$transaction(async (tx) => {
      return await this.generateOrderNumber(tx, "SALES");
    });

    const createdWebOrder = await this.prisma.webOrder.create({
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
          subDistrict: form.subDistrict,
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

    return createdWebOrder;
  }

  // =========================================================================
  // 🌟 FUNGSI: PROSES KONVERSI KE SISTEM UTAMA (ORDER & CLIENT)
  // =========================================================================
  private async processPaidWebOrder(
    orderNumber: string,
    paymentMethod: string,
  ) {
    console.log(
      `\n🚀 [WEBHOOK START] Memulai proses konversi Web Order: ${orderNumber}`,
    );

    try {
      // ✨ PERUBAHAN: Kita membungkus transaction ke dalam variabel resultData
      // agar kita bisa mengambil email pembeli untuk dikirimkan di luar transaksi.
      const resultData = await this.prisma.$transaction(async (tx) => {
        const webOrder = await tx.webOrder.findUnique({
          where: { orderNumber },
          include: {
            profile: true,
            items: true,
          },
        });

        if (!webOrder) {
          throw new Error("Web Order tidak ditemukan");
        }

        if (webOrder.status === "PAID" || webOrder.status === "PROCESSING") {
          return null; // Menghentikan jika sudah berstatus PAID (Mencegah duplikat)
        }

        const webChannel = await tx.purchaseChannel.findUnique({
          where: { slug: "website" },
        });
        if (!webChannel) {
          throw new Error(
            "Mohon buat data PurchaseChannel dengan slug 'website'!",
          );
        }

        let clientIdToUse = "";
        let addressData: any = {};
        try {
          addressData =
            typeof webOrder.shippingAddress === "string"
              ? JSON.parse(webOrder.shippingAddress)
              : webOrder.shippingAddress;
        } catch (e) {}

        const formattedAddressString = [
          addressData.fullAddress,
          addressData.subDistrict,
          addressData.district,
          addressData.city,
          addressData.province,
          addressData.postalCode,
        ]
          .filter(Boolean)
          .join(", ");

        const finalAddress =
          formattedAddressString || addressData.fullAddress || "-";

        const existingClient = webOrder.profile?.userId
          ? await tx.client.findFirst({
              where: { userId: webOrder.profile.userId },
            })
          : null;

        if (existingClient) {
          clientIdToUse = existingClient.id;
          const isCorporate = webOrder.profile?.accountType === "CORPORATE";
          if (isCorporate) {
            await tx.clientB2B
              .update({
                where: { id: clientIdToUse },
                data: {
                  fullAddress: addressData.fullAddress || "-",
                },
              })
              .catch(() => {});
          } else {
            await tx.clientB2C
              .update({
                where: { id: clientIdToUse },
                data: {
                  fullAddress: addressData.fullAddress || "-",
                },
              })
              .catch(() => {});
          }
        } else {
          const isCorporate = webOrder.profile?.accountType === "CORPORATE";
          const clientType = isCorporate ? ClientType.B2B : ClientType.B2C;
          const prefix = clientType === ClientType.B2B ? "B" : "C";
          const counterType =
            clientType === ClientType.B2B ? "CLIENT_B2B_OFF" : "CLIENT_B2C_OFF";

          const sequence = await this.counterService.getNextFormattedNumber(
            tx,
            counterType,
            "",
            5,
          );
          const custCode = `${prefix}${sequence}`;

          const newClient = await tx.client.create({
            data: {
              custCode: custCode,
              type: clientType,
              status: "OFFICIAL",
              userId: webOrder.profile?.userId || undefined,
            },
          });
          clientIdToUse = newClient.id;

          if (isCorporate) {
            const defaultDept = await tx.department.findFirst();
            if (!defaultDept) throw new Error("Belum ada data Department!");

            await tx.clientB2B.create({
              data: {
                id: newClient.id,
                companyName: webOrder.profile?.companyName || "Perusahaan Web",
                departmentId: defaultDept.id,
                website: "-",
                phone: webOrder.guestPhone || addressData.phone,
                fullAddress: addressData.fullAddress || "-",
              },
            });
          } else {
            await tx.clientB2C.create({
              data: {
                id: newClient.id,
                prefix: "Mr/Ms",
                name: webOrder.guestName || addressData.recipient || "Guest",
                phone: webOrder.guestPhone || addressData.phone,
                fullAddress: addressData.fullAddress || "-",
              },
            });
          }
        }

        const generatedOrderNumber = webOrder.orderNumber;

        const processedOrderProducts = await Promise.all(
          webOrder.items.map(async (item: any) => {
            let mappedSelectedAttributes: Record<string, string> | null = null;
            if (
              item.selectedAttributes &&
              typeof item.selectedAttributes === "object"
            ) {
              mappedSelectedAttributes = {};
              const attrEntries = Object.entries(item.selectedAttributes);

              for (const [attrName, attrValue] of attrEntries) {
                const dbAttrValue = await tx.productAttributeValue.findFirst({
                  where: {
                    productId: item.productId,
                    attribute: { name: attrName },
                    attributeValue: {
                      value: { contains: attrValue as string },
                    },
                  },
                });

                if (dbAttrValue && dbAttrValue.attributeId) {
                  mappedSelectedAttributes[dbAttrValue.attributeId] =
                    dbAttrValue.attributeValueId;
                }
              }
            }

            return {
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPrice: item.price,
              customization: item.customization || undefined,
              remarks: item.notes,
              selectedAttributes: mappedSelectedAttributes || undefined,
            };
          }),
        );

        // ✨ TAMBAHAN: Set warrantyDays ke 30 secara default untuk setiap order baru
        await tx.order.create({
          data: {
            orderNumber: generatedOrderNumber,
            dateOrder: new Date(),
            salesCategory: SalesCategory.SALES,
            clientId: clientIdToUse,
            purchaseChannelId: webChannel.id,
            shippingAddress: finalAddress,
            totalAmount: webOrder.totalAmount,
            webOrderId: webOrder.id,
            warrantyDays: 30, // <== Penambahan Warranty 30 Hari
            products: {
              create: processedOrderProducts,
            },
          },
        });

        await tx.webOrder.update({
          where: { id: webOrder.id },
          data: {
            status: "PAID",
            paymentMethod: paymentMethod,
          },
        });

        // ✨ TAMBAHAN: Mengumpulkan data untuk dikirimkan melalui Email
        let customerEmail = webOrder.guestEmail;
        let customerName =
          webOrder.guestName || addressData.recipient || "Pelanggan";

        // Jika Guest Email kosong, coba ambil dari data User jika dia login
        if (!customerEmail && webOrder.profile?.userId) {
          const user = await tx.user.findUnique({
            where: { id: webOrder.profile.userId },
            select: { email: true, name: true },
          });
          if (user) {
            customerEmail = user.email;
            customerName = user.name || customerName;
          }
        }

        return {
          email: customerEmail,
          name: customerName,
          orderNumber: generatedOrderNumber,
        };
      });

      // ✨ TAMBAHAN: Eksekusi pengiriman email DILUAR prisma transaction
      if (resultData && resultData.email) {
        try {
          await this.emailService.sendOrderConfirmationEmail(
            resultData.email,
            resultData.name,
            resultData.orderNumber,
          );
          console.log(
            `✉️ Email konfirmasi pesanan berhasil dikirim ke ${resultData.email}`,
          );
        } catch (emailError) {
          console.error(
            "❌ Gagal mengirim email konfirmasi pesanan:",
            emailError,
          );
        }
      }
    } catch (error) {
      console.error(
        `🚨 [WEBHOOK FAILED] Terjadi kesalahan saat memproses Order ${orderNumber}:`,
        error,
      );
      throw error;
    }
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

  async handleMidtransNotification(notificationRaw: any) {
    try {
      const statusResponse = await (coreApi as any).transaction.notification(
        notificationRaw,
      );

      const rawOrderId = statusResponse.order_id;
      const transactionStatus = statusResponse.transaction_status;
      const fraudStatus = statusResponse.fraud_status;

      const actualOrderNumber = rawOrderId.split("_")[0];
      const paymentMethodFromMidtrans = statusResponse.payment_type;

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
        if (newStatus === "PAID") {
          await this.processPaidWebOrder(
            actualOrderNumber,
            paymentMethodFromMidtrans,
          );
        } else {
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
}
