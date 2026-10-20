import {
  ClientType,
  InvoiceBillingMode,
  InvoiceCategory,
  InvoiceStatus,
  PaymentMethod,
  Prisma,
  SalesCategory,
  TransactionType,
  WebOrderStatus,
} from "@prisma/client";

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

        let parsedCustomization: any = null;
        if (item.customization) {
          try {
            parsedCustomization =
              typeof item.customization === "string"
                ? JSON.parse(item.customization)
                : item.customization;
          } catch (e) {}
        }

        const isAir = parsedCustomization?.freightMode === "AIR";

        let actualPrice =
          isAir && dbProduct.basePriceAir
            ? Number(dbProduct.basePriceAir)
            : Number(dbProduct.basePrice);
        let productName = dbProduct.name;

        const allProductTiers = dbProduct.priceTiers || [];
        const filteredProductTiers = isAir
          ? allProductTiers.filter((t: any) => t.freightMode === "AIR")
          : allProductTiers.filter(
              (t: any) => !t.freightMode || t.freightMode === "SEA",
            );
        let activeTiers: any[] =
          filteredProductTiers.length > 0
            ? filteredProductTiers
            : allProductTiers;

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

          if (isAir && dbVariant.priceAir) {
            actualPrice = Number(dbVariant.priceAir);
          } else {
            actualPrice = Number(dbVariant.price ?? actualPrice);
          }
          productName = `${dbProduct.name} - ${dbVariant.variantName || "Varian"}`;

          const allVariantTiers = dbVariant.priceTiers || [];
          const filteredVariantTiers = isAir
            ? allVariantTiers.filter((t: any) => t.freightMode === "AIR")
            : allVariantTiers.filter(
                (t: any) => !t.freightMode || t.freightMode === "SEA",
              );

          if (filteredVariantTiers.length > 0) {
            activeTiers = filteredVariantTiers;
          } else if (allVariantTiers.length > 0) {
            activeTiers = allVariantTiers;
          } else if (activeTiers.length > 0 && dbVariant.price) {
            const vBase =
              isAir && dbProduct.basePriceAir
                ? Number(dbProduct.basePriceAir)
                : Number(dbProduct.basePrice);
            const diff = actualPrice - vBase;
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

  private mapMidtransPaymentMethod(paymentType: string): PaymentMethod | null {
    const method = paymentType?.toLowerCase();

    if (method === "credit_card") return PaymentMethod.CREDIT_CARD;

    if (method === "qris") return PaymentMethod.QRIS;

    if (
      [
        "bank_transfer",
        "echannel",
        "permata",
        "bca_klikpay",
        "bca_klikbca",
        "bri_epay",
      ].includes(method)
    ) {
      return PaymentMethod.BANK_TRANSFER;
    }

    return null;
  }

  // =========================================================================
  // 🌟 FUNGSI: PROSES KONVERSI KE SISTEM UTAMA (ORDER & CLIENT)
  // =========================================================================

  private async processPaidWebOrder(
    orderNumber: string,
    paymentMethod: string,
    paymentAttemptId: string,
    midtransTransactionId: string | null,
  ) {
    console.log(`[WEBHOOK] Processing paid order: ${orderNumber}`);

    try {
      const resultData = await this.prisma.$transaction(
        async (tx) => {
          const webOrder = await tx.webOrder.findUnique({
            where: { orderNumber },
            include: {
              profile: true,
              items: true,
            },
          });

          if (!webOrder) {
            throw new ApiError("Web Order tidak ditemukan", 404);
          }

          if (webOrder.status === "PAID" || webOrder.status === "PROCESSING") {
            return null;
          }

          if (webOrder.status !== "PENDING_PAYMENT") {
            throw new ApiError(
              `Web Order tidak dapat diproses dari status ${webOrder.status}`,
              409,
            );
          }

          const claim = await tx.webOrder.updateMany({
            where: {
              id: webOrder.id,
              status: "PENDING_PAYMENT",
            },
            data: {
              status: "PAID",
              paymentMethod,
            },
          });

          if (claim.count !== 1) return null;

          const systemUserId = process.env.WEB_ORDER_SYSTEM_USER_ID;

          if (!systemUserId) {
            throw new Error("WEB_ORDER_SYSTEM_USER_ID belum dikonfigurasi");
          }

          const [systemUser, financeCategory, webChannel] = await Promise.all([
            tx.user.findUnique({
              where: { id: systemUserId },
              select: { id: true },
            }),
            tx.financeCategory.findUnique({
              where: { slug: "penjualan-website" },
              select: {
                id: true,
                type: true,
                isActive: true,
              },
            }),
            tx.purchaseChannel.findUnique({
              where: { slug: "website" },
            }),
          ]);

          if (!systemUser) {
            throw new Error("User sistem Web Order tidak ditemukan");
          }

          if (
            !financeCategory ||
            !financeCategory.isActive ||
            financeCategory.type !== TransactionType.INCOME
          ) {
            throw new Error(
              "Kategori Finance penjualan-website tidak ditemukan atau tidak valid",
            );
          }

          if (!webChannel) {
            throw new Error(
              "PurchaseChannel dengan slug website tidak ditemukan",
            );
          }

          if (!webOrder.items.length) {
            throw new Error("Web Order tidak memiliki produk");
          }

          const addressData: Record<string, any> =
            webOrder.shippingAddress &&
            typeof webOrder.shippingAddress === "object" &&
            !Array.isArray(webOrder.shippingAddress)
              ? (webOrder.shippingAddress as Record<string, any>)
              : {};

          const finalAddress =
            [
              addressData.fullAddress,
              addressData.subDistrict,
              addressData.district,
              addressData.city,
              addressData.province,
              addressData.postalCode,
            ]
              .filter(Boolean)
              .join(", ") || "-";

          const isCorporate = webOrder.profile?.accountType === "CORPORATE";

          const existingClient = webOrder.profile?.userId
            ? await tx.client.findFirst({
                where: { userId: webOrder.profile.userId },
              })
            : null;

          let clientIdToUse: string;

          if (existingClient) {
            clientIdToUse = existingClient.id;

            if (isCorporate) {
              await tx.clientB2B.update({
                where: { id: clientIdToUse },
                data: {
                  fullAddress: addressData.fullAddress || "-",
                },
              });
            } else {
              await tx.clientB2C.update({
                where: { id: clientIdToUse },
                data: {
                  fullAddress: addressData.fullAddress || "-",
                },
              });
            }
          } else {
            const clientType = isCorporate ? ClientType.B2B : ClientType.B2C;

            const counterType = isCorporate
              ? "CLIENT_B2B_OFF"
              : "CLIENT_B2C_OFF";

            const sequence = await this.counterService.getNextFormattedNumber(
              tx,
              counterType,
              "",
              5,
            );

            const newClient = await tx.client.create({
              data: {
                custCode: `${isCorporate ? "B" : "C"}${sequence}`,
                type: clientType,
                status: "OFFICIAL",
                userId: webOrder.profile?.userId || undefined,
              },
            });

            clientIdToUse = newClient.id;

            if (isCorporate) {
              const department = await tx.department.findFirst();

              if (!department) {
                throw new Error("Department default belum tersedia");
              }

              await tx.clientB2B.create({
                data: {
                  id: clientIdToUse,
                  companyName:
                    webOrder.profile?.companyName || "Perusahaan Web",
                  departmentId: department.id,
                  website: "-",
                  phone: webOrder.guestPhone || addressData.phone || "-",
                  fullAddress: addressData.fullAddress || "-",
                },
              });
            } else {
              await tx.clientB2C.create({
                data: {
                  id: clientIdToUse,
                  prefix: "Mr/Ms",
                  name: webOrder.guestName || addressData.recipient || "Guest",
                  phone: webOrder.guestPhone || addressData.phone || "-",
                  fullAddress: addressData.fullAddress || "-",
                },
              });
            }
          }

          const processedOrderProducts = [];

          for (const item of webOrder.items) {
            let selectedAttributes: Record<string, string> | undefined;

            if (
              item.selectedAttributes &&
              typeof item.selectedAttributes === "object" &&
              !Array.isArray(item.selectedAttributes)
            ) {
              const mapped: Record<string, string> = {};

              for (const [attrName, attrValue] of Object.entries(
                item.selectedAttributes,
              )) {
                if (typeof attrValue !== "string") continue;

                const attribute = await tx.productAttributeValue.findFirst({
                  where: {
                    productId: item.productId,
                    attribute: { name: attrName },
                    attributeValue: {
                      value: { contains: attrValue },
                    },
                  },
                });

                if (attribute?.attributeId) {
                  mapped[attribute.attributeId] = attribute.attributeValueId;
                }
              }

              if (Object.keys(mapped).length) {
                selectedAttributes = mapped;
              }
            }

            processedOrderProducts.push({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPrice: item.price,
              customization:
                item.customization === null
                  ? undefined
                  : (item.customization as Prisma.InputJsonValue),
              remarks: item.notes,
              selectedAttributes,
            });
          }

          const paidAt = new Date();
          const currencyCode = webOrder.currencyCode || "IDR";
          const method = this.mapMidtransPaymentMethod(paymentMethod);
          const amount = new Prisma.Decimal(webOrder.totalAmount);

          const createdOrder = await tx.order.create({
            data: {
              orderNumber: webOrder.orderNumber,
              dateOrder: paidAt,
              salesCategory: SalesCategory.SALES,
              clientId: clientIdToUse,
              purchaseChannelId: webChannel.id,
              shippingAddress: finalAddress,
              totalAmount: amount,
              currencyCode,
              webOrderId: webOrder.id,
              warrantyDays: 30,
              products: {
                create: processedOrderProducts,
              },
            },
            include: {
              products: true,
              client: {
                select: { custCode: true },
              },
            },
          });

          const invoiceItems = createdOrder.products.map((item) => ({
            orderProductId: item.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            price: item.unitPrice,
            remarks: item.remarks,
            customization: item.customization
              ? (item.customization as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          }));

          const invoice = await tx.invoice.create({
            data: {
              orderId: createdOrder.id,
              clientId: clientIdToUse,
              userId: systemUser.id,
              totalAmount: amount,
              category: InvoiceCategory.FULL_PAYMENT,
              billingMode: InvoiceBillingMode.STANDARD,
              status: InvoiceStatus.PAID,
              method,
              paidAt,
              paymentDate: paidAt,
              items: {
                createMany: { data: invoiceItems },
              },
            },
          });

          const romanMonths = [
            "I",
            "II",
            "III",
            "IV",
            "V",
            "VI",
            "VII",
            "VIII",
            "IX",
            "X",
            "XI",
            "XII",
          ];

          const invoiceNumber = [
            "INV",
            String(invoice.id).padStart(4, "0"),
            createdOrder.client.custCode || "NOC",
            romanMonths[paidAt.getMonth()],
            paidAt.getFullYear(),
          ].join("_");

          await tx.invoice.update({
            where: { id: invoice.id },
            data: { invoiceNumber },
          });

          await tx.financeTransaction.create({
            data: {
              transactionDate: paidAt,
              type: TransactionType.INCOME,
              amount,
              referenceNumber: `MIDTRANS:${paymentAttemptId}`,
              description:
                `Pembayaran Website ${webOrder.orderNumber} - ` +
                `Invoice ${invoiceNumber} - Midtrans ${paymentMethod}`,
              method,
              currencyCode,
              createdBy: systemUser.id,
              categoryId: financeCategory.id,
            },
          });

          const updatedAttempt = await tx.webPaymentAttempt.updateMany({
            where: {
              id: paymentAttemptId,
              webOrderId: webOrder.id,
              status: { not: "PAID" },
            },
            data: {
              status: "PAID",
              paymentType: paymentMethod,
              midtransTransactionId,
              paidAt,
            },
          });

          if (updatedAttempt.count !== 1) {
            throw new Error(
              `Payment attempt ${paymentAttemptId} gagal dikonfirmasi`,
            );
          }

          let customerEmail = webOrder.guestEmail;
          let customerName =
            webOrder.guestName || addressData.recipient || "Pelanggan";

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
            orderNumber: webOrder.orderNumber,
            invoiceNumber,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        },
      );

      if (!resultData) {
        console.log(`[WEBHOOK] Order ${orderNumber} sudah diproses sebelumnya`);
        return;
      }

      console.log(
        `[WEBHOOK SUCCESS] ${resultData.orderNumber} - ${resultData.invoiceNumber}`,
      );

      if (resultData.email) {
        try {
          await this.emailService.sendOrderConfirmationEmail(
            resultData.email,
            resultData.name,
            resultData.orderNumber,
          );
        } catch (emailError) {
          console.error(
            "[WEBHOOK] Gagal mengirim email konfirmasi:",
            emailError,
          );
        }
      }
    } catch (error) {
      console.error(`[WEBHOOK FAILED] Order ${orderNumber}:`, error);
      throw error;
    }
  }

  async createPayment(orderId: string) {
    const prepared = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.webOrder.findUnique({
          where: { id: orderId },
          include: {
            items: true,
            paymentAttempts: {
              orderBy: { attemptNumber: "desc" },
            },
          },
        });

        if (!order) throw new ApiError("Order tidak ditemukan", 404);
        if (order.status !== "PENDING_PAYMENT") {
          throw new ApiError("Order tidak membutuhkan pembayaran", 400);
        }
        if (!order.items.length) {
          throw new ApiError("Order tidak memiliki produk", 400);
        }

        await tx.webOrder.update({
          where: { id: order.id },
          data: { updatedAt: new Date() },
        });

        const latest = order.paymentAttempts[0];

        if (latest?.status === "PAID") {
          throw new ApiError("Pembayaran sudah berhasil", 409);
        }

        if (latest?.status === "CREATING") {
          throw new ApiError(
            "Sesi pembayaran sedang dibuat. Silakan coba kembali.",
            409,
          );
        }

        if (latest?.status === "PENDING") {
          if (!latest.redirectUrl) {
            throw new ApiError(
              "URL pembayaran belum tersedia. Hubungi admin.",
              409,
            );
          }

          return {
            reused: true as const,
            redirect_url: latest.redirectUrl,
            attemptId: latest.id,
          };
        }

        const amount = Math.round(Number(order.totalAmount));
        if (!Number.isSafeInteger(amount) || amount <= 0) {
          throw new ApiError("Nominal pembayaran tidak valid", 400);
        }

        const itemDetails = order.items.map((item) => ({
          id: item.productId,
          price: Math.round(Number(item.price)),
          quantity: item.quantity,
          name: item.productName.substring(0, 50),
        }));

        if (Number(order.shippingCost || 0) > 0) {
          itemDetails.push({
            id: "SHIPPING-FEE",
            price: Math.round(Number(order.shippingCost)),
            quantity: 1,
            name: "Ongkos Kirim",
          });
        }

        if (Number(order.taxAmount || 0) > 0) {
          itemDetails.push({
            id: "TAX-FEE",
            price: Math.round(Number(order.taxAmount)),
            quantity: 1,
            name: "Pajak",
          });
        }

        const calculatedTotal = itemDetails.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0,
        );

        if (calculatedTotal !== amount) {
          throw new ApiError(
            `Total item ${calculatedTotal} tidak sama dengan total order ${amount}`,
            400,
          );
        }

        const attemptNumber = (latest?.attemptNumber || 0) + 1;
        const midtransOrderId = `${order.orderNumber}_${attemptNumber}`;

        const attempt = await tx.webPaymentAttempt.create({
          data: {
            webOrderId: order.id,
            midtransOrderId,
            attemptNumber,
            status: "CREATING",
            amount: order.totalAmount,
            currencyCode: order.currencyCode || "IDR",
          },
        });

        return {
          reused: false as const,
          attemptId: attempt.id,
          parameter: {
            transaction_details: {
              order_id: midtransOrderId,
              gross_amount: amount,
            },
            item_details: itemDetails,
            customer_details: {
              first_name: order.guestName || "Customer",
              email: order.guestEmail || undefined,
              phone: order.guestPhone || undefined,
            },
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 20000,
      },
    );

    if (prepared.reused) {
      return {
        redirect_url: prepared.redirect_url,
        reused: true,
      };
    }

    try {
      const transaction = await snap.createTransaction(prepared.parameter);

      const updated = await this.prisma.webPaymentAttempt.updateMany({
        where: {
          id: prepared.attemptId,
          status: "CREATING",
        },
        data: {
          status: "PENDING",
          redirectUrl: transaction.redirect_url,
          snapToken: transaction.token,
        },
      });

      if (updated.count === 0) {
        const current = await this.prisma.webPaymentAttempt.findUnique({
          where: { id: prepared.attemptId },
        });

        if (current?.status !== "PAID") {
          throw new Error("Status payment attempt berubah");
        }
      }

      await this.prisma.webOrder.updateMany({
        where: {
          id: orderId,
          status: "PENDING_PAYMENT",
        },
        data: { paymentUrl: transaction.redirect_url },
      });

      return {
        ...transaction,
        reused: false,
      };
    } catch (error) {
      console.error("[MIDTRANS CREATE PAYMENT]", error);

      const currentAttempt = await this.prisma.webPaymentAttempt.findUnique({
        where: { id: prepared.attemptId },
        select: {
          status: true,
          redirectUrl: true,
          midtransOrderId: true,
        },
      });

      if (currentAttempt?.status === "PAID") {
        throw new ApiError(
          "Pembayaran sudah berhasil. Periksa status pesanan.",
          409,
        );
      }

      if (currentAttempt?.status === "PENDING" && currentAttempt.redirectUrl) {
        return {
          redirect_url: currentAttempt.redirectUrl,
          reused: true,
        };
      }

      console.error(
        "[MIDTRANS RECOVERY REQUIRED]",
        currentAttempt?.midtransOrderId,
      );

      throw new ApiError(
        "Status pembayaran belum dapat dipastikan. " +
          "Hubungi admin untuk pemeriksaan transaksi Midtrans.",
        503,
      );
    }
  }

  private async processPaidWebOrderWithRetry(
    orderNumber: string,
    paymentMethod: string,
    paymentAttemptId: string,
    midtransTransactionId: string | null,
  ) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.processPaidWebOrder(
          orderNumber,
          paymentMethod,
          paymentAttemptId,
          midtransTransactionId,
        );
        return;
      } catch (error) {
        const isRetryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034";

        if (!isRetryable || attempt === maxAttempts) {
          throw error;
        }

        console.warn(
          `[MIDTRANS] Transaction conflict ${orderNumber}, retry ${attempt}/${maxAttempts}`,
        );

        await new Promise<void>((resolve) =>
          setTimeout(resolve, attempt * 150),
        );
      }
    }
  }

  private async verifyPaidOrderConsistency(
    orderNumber: string,
    paymentAttemptId: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        invoices: {
          where: {
            status: "PAID",
            category: "FULL_PAYMENT",
          },
          select: {
            id: true,
            totalAmount: true,
          },
        },
      },
    });

    if (!order) {
      throw new Error(
        `Order Sales ${orderNumber} tidak ditemukan setelah pembayaran`,
      );
    }

    if (
      order.invoices.length !== 1 ||
      !order.invoices[0].totalAmount.equals(order.totalAmount)
    ) {
      throw new Error(`Invoice PAID untuk ${orderNumber} tidak konsisten`);
    }

    const financeTransactions = await this.prisma.financeTransaction.findMany({
      where: {
        referenceNumber: `MIDTRANS:${paymentAttemptId}`,
        type: "INCOME",
      },
      select: {
        id: true,
        amount: true,
      },
    });

    if (
      financeTransactions.length !== 1 ||
      !financeTransactions[0].amount.equals(order.totalAmount)
    ) {
      throw new Error(`Finance INCOME untuk ${orderNumber} tidak konsisten`);
    }

    return true;
  }

  async handleMidtransNotification(notificationRaw: any) {
    try {
      const notification = await (coreApi as any).transaction.notification(
        notificationRaw,
      );

      const midtransOrderId = String(notification.order_id || "");
      const transactionStatus = String(notification.transaction_status || "");
      const fraudStatus = notification.fraud_status;
      const paymentType = String(notification.payment_type || "other");
      const transactionId = notification.transaction_id
        ? String(notification.transaction_id)
        : null;

      const attempt = await this.prisma.webPaymentAttempt.findUnique({
        where: { midtransOrderId },
        include: {
          webOrder: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              totalAmount: true,
            },
          },
        },
      });

      if (!attempt) {
        throw new Error(`Payment attempt tidak ditemukan: ${midtransOrderId}`);
      }

      const paidAmount = new Prisma.Decimal(String(notification.gross_amount));

      if (
        !paidAmount.equals(attempt.amount) ||
        !paidAmount.equals(attempt.webOrder.totalAmount)
      ) {
        throw new Error(`Nominal Midtrans tidak sesuai: ${midtransOrderId}`);
      }

      if (
        attempt.midtransTransactionId &&
        transactionId &&
        attempt.midtransTransactionId !== transactionId
      ) {
        throw new Error("Midtrans transaction ID tidak sesuai");
      }

      const isPaid =
        transactionStatus === "settlement" ||
        (transactionStatus === "capture" &&
          (fraudStatus === "accept" || !fraudStatus));

      if (isPaid) {
        if (attempt.status === "PAID") {
          const primaryFinance = await this.prisma.financeTransaction.findFirst(
            {
              where: {
                referenceNumber: `MIDTRANS:${attempt.id}`,
                type: "INCOME",
              },
              select: { id: true },
            },
          );

          if (!primaryFinance) {
            const otherPaidAttempt =
              await this.prisma.webPaymentAttempt.findFirst({
                where: {
                  webOrderId: attempt.webOrder.id,
                  id: { not: attempt.id },
                  status: "PAID",
                },
                select: { id: true },
              });

            if (attempt.webOrder.status === "PAID" && otherPaidAttempt) {
              console.error(
                `[MIDTRANS DUPLICATE PAYMENT] ${midtransOrderId} ` +
                  "memerlukan rekonsiliasi/refund.",
              );

              return {
                success: true,
                duplicatePayment: true,
              };
            }

            throw new Error(
              `Pembayaran ${midtransOrderId} belum memiliki ` +
                "catatan Finance yang konsisten.",
            );
          }

          await this.verifyPaidOrderConsistency(
            attempt.webOrder.orderNumber,
            attempt.id,
          );

          return {
            success: true,
            alreadyProcessed: true,
          };
        }

        if (attempt.webOrder.status === "PAID") {
          await this.prisma.webPaymentAttempt.updateMany({
            where: {
              id: attempt.id,
              status: { not: "PAID" },
            },
            data: {
              status: "PAID",
              paymentType,
              midtransTransactionId: transactionId,
              paidAt: new Date(),
            },
          });

          console.error(
            `[MIDTRANS DUPLICATE PAYMENT] ${midtransOrderId}: ` +
              "Order sudah lunas dari percobaan pembayaran lain. " +
              "Perlu pemeriksaan dan refund jika benar terjadi pembayaran ganda.",
          );

          return {
            success: true,
            duplicatePayment: true,
          };
        }

        if (attempt.webOrder.status !== "PENDING_PAYMENT") {
          throw new Error(
            `WebOrder ${attempt.webOrder.orderNumber} ` +
              `berstatus ${attempt.webOrder.status}`,
          );
        }

        await this.processPaidWebOrderWithRetry(
          attempt.webOrder.orderNumber,
          paymentType,
          attempt.id,
          transactionId,
        );

        return { success: true };
      }

      if (attempt.status === "PAID") {
        return { success: true, alreadyProcessed: true };
      }

      if (transactionStatus === "pending") {
        await this.prisma.webPaymentAttempt.updateMany({
          where: {
            id: attempt.id,
            status: "CREATING",
          },
          data: {
            status: "PENDING",
            paymentType,
            midtransTransactionId: transactionId,
          },
        });

        return { success: true };
      }

      const statusMap = {
        expire: "EXPIRED",
        cancel: "CANCELLED",
        deny: "FAILED",
        failure: "FAILED",
      } as const;

      const nextStatus = statusMap[transactionStatus as keyof typeof statusMap];

      if (nextStatus) {
        await this.prisma.webPaymentAttempt.updateMany({
          where: {
            id: attempt.id,
            status: { in: ["CREATING", "PENDING"] },
          },
          data: {
            status: nextStatus,
            paymentType,
            midtransTransactionId: transactionId,
          },
        });

        return { success: true };
      }

      console.log(`[MIDTRANS] Status ${transactionStatus} belum diproses`);

      return { success: true };
    } catch (error) {
      console.error("[MIDTRANS WEBHOOK ERROR]", error);
      throw error;
    }
  }
}
