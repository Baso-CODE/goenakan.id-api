import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { getErrorMessage } from "../../../middleware/getErrorMessage";
import { ApiError } from "../../../utils/api-error";
import { CounterService } from "../../../utils/counter.service";
import { CloudinaryService } from "../../cloudinary/cloudinary.service";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { WhatsappNotificationService } from "../../whatsapp/notification/whatsapp-notification.service";
import { CreateOrderDTO } from "./dto/createOrder.dto";
import { UpdateOrderDTO } from "./dto/upadateOrder.dto";

export interface OrderExportQuery {
  startDate?: string;
  endDate?: string;
  search?: string;
  salesCategory?: string;
}

@injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private whatsappNotification: WhatsappNotificationService,
    private readonly counterService: CounterService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // ====================================================================
  // HELPER: GENERATE ORDER NUMBER (Format: GI-SO260700001 atau GI-SN260700001)
  // ====================================================================
  private async generateOrderNumber(
    tx: any,
    category: "SALES" | "SAMPLE",
  ): Promise<string> {
    // Tentukan kode form (SO untuk Sales, SN untuk Sample)
    const formCode = category === "SALES" ? "SO" : "SN";

    // Ambil periode tahun dan bulan saat ini (Contoh: "2607" untuk Juli 2026)
    const periodYYMM = this.counterService.getCurrentPeriodYYMM();

    // Tipe counter di database akan menjadi "SO_2607" atau "SN_2607"
    // agar nomor urut otomatis mereset setiap bulan baru.
    const counterType = `${formCode}_${periodYYMM}`;

    // Ambil nomor urut berikutnya secara aman (Atomic Increment) dengan 5 digit (XXXXX)
    const sequence = await this.counterService.getNextFormattedNumber(
      tx,
      counterType,
      periodYYMM,
      5,
    );

    // Gabungkan menjadi format akhir: GI-XXYYMMXXXXX
    return `GI-${formCode}${periodYYMM}${sequence}`;
  }

  // ====================================================================
  // MAIN METHOD: CREATE ORDER
  // ====================================================================
  async createOrder(data: CreateOrderDTO, file?: Express.Multer.File) {
    const {
      products,
      clientB2BPICId,
      purchaseChannelId,
      sampleFollowUps,
      warrantyDays,
      ...orderCore
    } = data;
    let totalAmount = 0;
    const orderProductsData: any[] = [];

    // ✨ Variabel penampung untuk history produk sample
    const sampleHistoryData: any[] = [];

    const isSampleOrder = orderCore.salesCategory === "SAMPLE";

    // ====================================================================
    // UPLOAD FILE KE CLOUDINARY (Di luar transaksi DB)
    // ====================================================================
    let uploadedPoData: {
      url: string;
      fileName: string;
      fileType: string;
    } | null = null;

    if (file) {
      const uploadResult = await this.cloudinary.upload(file, {
        folder: "orders/client_po",
        resource_type: "auto",
      });

      uploadedPoData = {
        url: uploadResult.secure_url,
        fileName: file.originalname,
        fileType: file.mimetype,
      };
    }
    // ====================================================================

    for (const item of products) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: {
          productVariants: true,
          priceTiers: { orderBy: { minQuantity: "desc" } },
        },
      });

      if (!product) {
        throw new ApiError(`Product with ID ${item.productId} not found`, 404);
      }

      // Cek apakah barang yang dipinjamkan adalah produk tipe SAMPLE
      // Jika ya, masukkan ke keranjang history. (orderId kita isi nanti setelah order di-create)
      if (isSampleOrder && product.isSample) {
        sampleHistoryData.push({
          productId: product.id,
          clientId: orderCore.clientId,
          status: "ORDER_SAMPLE_CREATE",
          date: new Date(),
          notes: `Dipinjamkan sebanyak ${item.quantity} ${product.uom}`,
        });
      }

      let finalPrice = 0;

      if (isSampleOrder) {
        if (item.price !== undefined && item.price !== null && item.price > 0) {
          finalPrice = Number(item.price);
        } else {
          finalPrice = 0;
        }
      } else {
        finalPrice = item.price ? Number(item.price) : 0;

        if (finalPrice === 0) {
          if (product.isCustom) {
            if (!item.variantId) {
              throw new ApiError(
                `Variant is required for custom product: ${product.name}`,
                400,
              );
            }
            const variant = product.productVariants.find(
              (v) => v.id === item.variantId,
            );
            if (!variant || !variant.price) {
              throw new ApiError(
                `Invalid variant for product: ${product.name}`,
                400,
              );
            }
            finalPrice = Number(variant.price);

            // Apply nominal discounts from parent product tiers if any
            if (product.priceTiers && product.priceTiers.length > 0) {
              const applicableTier = product.priceTiers.find(
                (t) => item.quantity >= t.minQuantity,
              );
              if (applicableTier) {
                const basePriceVal = Number(product.basePrice);
                const tierPriceVal = Number(applicableTier.price);
                const discount = Math.max(0, basePriceVal - tierPriceVal);
                finalPrice = Math.max(0, finalPrice - discount);
              }
            }
          } else {
            finalPrice = Number(product.basePrice);
            if (product.priceTiers && product.priceTiers.length > 0) {
              const applicableTier = product.priceTiers.find(
                (t) => item.quantity >= t.minQuantity,
              );
              if (applicableTier) {
                finalPrice = Number(applicableTier.price);
              }
            }
          }
        }
      }

      const subtotal = finalPrice * item.quantity;
      totalAmount += subtotal;

      const productData: any = {
        product: { connect: { id: item.productId } },
        quantity: item.quantity,
        unitPrice: finalPrice,
        variant: item.variantId
          ? { connect: { id: item.variantId } }
          : undefined,
        selectedAttributes: item.selectedAttributes
          ? item.selectedAttributes
          : undefined,
      };

      if (item.customization) {
        productData.customization = JSON.stringify({
          detail: item.customization,
        });
      }
      if (item.remarks) {
        productData.remarks = item.remarks;
      }

      orderProductsData.push(productData);
    }

    const newOrder = await this.prisma.$transaction(async (tx) => {
      const connectRelations: any = {};

      const generatedOrderNumber = await this.generateOrderNumber(
        tx,
        orderCore.salesCategory,
      );
      if (clientB2BPICId) {
        connectRelations.pic = { connect: { id: clientB2BPICId } };
      }

      if (purchaseChannelId) {
        connectRelations.purchaseChannel = {
          connect: { id: purchaseChannelId },
        };
      }

      if (orderCore.currencyCode) {
        connectRelations.currency = {
          connect: { code: orderCore.currencyCode },
        };
      } else {
        connectRelations.currency = { connect: { code: "IDR" } };
      }

      if (orderCore.referenceQuotationId) {
        connectRelations.referenceQuotation = {
          connect: { id: orderCore.referenceQuotationId },
        };
      }

      if (orderCore.referenceSampleId) {
        connectRelations.referenceSample = {
          connect: { id: orderCore.referenceSampleId },
        };
      }

      if (orderCore.createdById) {
        connectRelations.createdBy = { connect: { id: orderCore.createdById } };
      }

      const order = await tx.order.create({
        data: {
          orderNumber: generatedOrderNumber,
          dateOrder: new Date(orderCore.dateOrder),
          salesCategory: orderCore.salesCategory,
          clientPoNumber: orderCore.clientPoNumber || null,
          remark: orderCore.remark || null,
          shippingAddress: orderCore.shippingAddress,
          totalAmount: totalAmount,
          warrantyDays:
            warrantyDays !== undefined && warrantyDays !== null
              ? Number(warrantyDays)
              : null,
          client: { connect: { id: orderCore.clientId } },
          ...connectRelations,

          products: {
            create: orderProductsData,
          },
        },
        include: {
          products: true,
          client: {
            include: {
              b2b: { include: { pics: true } },
              b2c: true,
            },
          },
          pic: true,
          purchaseChannel: true,
          currency: true,
          referenceQuotation: true,
          referenceSample: true,
          createdBy: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      });

      // ====================================================================
      // SIMPAN DATA CLIENT PURCHASE ORDER
      // ====================================================================
      if (orderCore.clientPoNumber || uploadedPoData) {
        await tx.clientPurchaseOrder.create({
          data: {
            orderId: order.id,
            poNumber: orderCore.clientPoNumber || null,
            fileUrl: uploadedPoData?.url || null,
            fileName: uploadedPoData?.fileName || null,
            fileType: uploadedPoData?.fileType || null,
          },
        });
      }

      // SIMPAN SAMPLE HISTORY (Hanya untuk produk yang isSample === true)
      if (sampleHistoryData.length > 0) {
        // Karena array sebelumnya belum punya orderId (karena order belum jadi),
        // kita map ulang untuk menambahkan order.id yang baru saja kita dapatkan
        const finalizedHistoryData = sampleHistoryData.map((data) => ({
          ...data,
          orderId: order.id,
        }));

        await tx.sampleProductHistory.createMany({
          data: finalizedHistoryData,
        });
      }
      // ====================================================================

      const clientRecord = await tx.client.findUnique({
        where: { id: orderCore.clientId },
        select: { status: true, type: true, custCode: true },
      });

      if (clientRecord && clientRecord.status === "POTENTIAL") {
        const prefix = clientRecord.type === "B2B" ? "B" : "C";
        const counterType =
          clientRecord.type === "B2B" ? "CLIENT_B2B_OFF" : "CLIENT_B2C_OFF";

        const sequence = await this.counterService.getNextFormattedNumber(
          tx,
          counterType,
          "",
          5,
        );

        const newCustCode = `${prefix}${sequence}`;

        await tx.client.update({
          where: { id: orderCore.clientId },
          data: {
            status: "OFFICIAL",
            custCode: newCustCode,
          },
        });
      }

      if (isSampleOrder && sampleFollowUps && sampleFollowUps.length > 0) {
        await tx.orderSampleFollowUp.createMany({
          data: sampleFollowUps.map((fu) => ({
            orderId: order.id,
            date: fu.date ? new Date(fu.date) : new Date(),
            name: fu.name || null,
            method: fu.method || null,
            notes: fu.notes || null,
            nextAction: fu.nextAction || null,
            isDone: fu.isDone ?? false,
          })),
        });
      }

      return order;
    });
    return newOrder;
  }

  async updateOrder(id: string, data: UpdateOrderDTO) {
    const {
      products,
      clientB2BPICId,
      purchaseChannelId,
      referenceQuotationId,
      referenceSampleId,
      warrantyDays,
      sampleFollowUps,
      updatedById,
      ...orderCore
    } = data;

    const existingOrder = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      throw new ApiError(`Order with ID ${id} not found`, 404);
    }

    if (orderCore.clientId !== existingOrder.clientId) {
      throw new ApiError("Client tidak dapat diubah setelah order dibuat", 400);
    }
    if (orderCore.salesCategory !== existingOrder.salesCategory) {
      throw new ApiError(
        "Sales category tidak dapat diubah setelah order dibuat",
        400,
      );
    }

    const isPending = existingOrder.status === "PENDING";

    let totalAmount = Number(existingOrder.totalAmount);
    const orderProductsData: any[] = [];

    if (isPending) {
      totalAmount = 0;

      for (const item of products) {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
          include: { productVariants: true },
        });

        if (!product) {
          throw new ApiError(
            `Product with ID ${item.productId} not found`,
            404,
          );
        }

        if (product.isCustom && !item.variantId) {
          throw new ApiError(
            `Variant is required for custom product: ${product.name}`,
            400,
          );
        }

        if (product.isCustom && item.variantId) {
          const variantExists = product.productVariants.find(
            (v) => v.id === item.variantId,
          );
          if (!variantExists) {
            throw new ApiError(
              `Invalid variant for product: ${product.name}`,
              400,
            );
          }
        }

        const finalPrice = Number(item.price);
        totalAmount += finalPrice * item.quantity;

        const productData: any = {
          product: { connect: { id: item.productId } },
          quantity: item.quantity,
          unitPrice: finalPrice,
          variant: item.variantId
            ? { connect: { id: item.variantId } }
            : undefined,
          selectedAttributes: item.selectedAttributes
            ? item.selectedAttributes
            : undefined,
        };

        if (item.customization) {
          productData.customization = JSON.stringify({
            detail: item.customization,
          });
        }
        if (item.remarks) {
          productData.remarks = item.remarks;
        }

        orderProductsData.push(productData);
      }
    }

    const followUpsData =
      existingOrder.salesCategory === "SAMPLE" && sampleFollowUps?.length
        ? sampleFollowUps.map((fu) => ({
            name: fu.name,
            date: fu.date ? new Date(fu.date) : new Date(),
            method: fu.method || null,
            notes: fu.notes || null,
            nextAction: fu.nextAction || null,
            isDone: false,
          }))
        : [];

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      if (isPending) {
        await tx.orderProduct.deleteMany({ where: { orderId: id } });
      }

      await tx.orderSampleFollowUp.deleteMany({ where: { orderId: id } });

      const updateRelations: any = {};

      updateRelations.pic = clientB2BPICId
        ? { connect: { id: clientB2BPICId } }
        : { disconnect: true };

      updateRelations.purchaseChannel = purchaseChannelId
        ? { connect: { id: purchaseChannelId } }
        : { disconnect: true };

      updateRelations.referenceQuotation = referenceQuotationId
        ? { connect: { id: referenceQuotationId } }
        : { disconnect: true };

      updateRelations.referenceSample = referenceSampleId
        ? { connect: { id: referenceSampleId } }
        : { disconnect: true };
      if (updatedById) {
        updateRelations.updatedBy = { connect: { id: updatedById } };
      }
      const order = await tx.order.update({
        where: { id },
        data: {
          dateOrder: new Date(orderCore.dateOrder),
          warrantyDays: warrantyDays ?? null,
          clientPoNumber: orderCore.clientPoNumber || null,
          remark: orderCore.remark || null,
          currency: { connect: { code: orderCore.currencyCode || "IDR" } },
          shippingAddress: orderCore.shippingAddress,
          totalAmount,
          ...updateRelations,

          sampleFollowUps: followUpsData.length
            ? { create: followUpsData }
            : undefined,

          // Products hanya di-recreate jika PENDING
          ...(isPending && orderProductsData.length
            ? { products: { create: orderProductsData } }
            : {}),
        },
        include: {
          products: true,
          pic: true,
          purchaseChannel: true,
          sampleFollowUps: true,
        },
      });

      return order;
    });

    return updatedOrder;
  }

  async deleteOrder(id: string) {
    return await this.prisma.$transaction(async (tx) => {
      const allowedStatuses = ["PENDING", "CANCELLED"] as const;

      const order = await tx.order.findUnique({
        where: { id },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          salesCategory: true,
          _count: {
            select: {
              invoices: true,
              cashflows: true,
              cashflowSummary: true,
              productionTrackers: true,
              shipments: true,
              deliveryNotes: true,
              purchaseOrderItems: true,
              warranties: true,
              replacementOrders: true,
              resultingOrders: true,
              quotations: true,
              whatsappMessages: true,
            },
          },
        },
      });

      if (!order) {
        throw new ApiError("Order tidak ditemukan", 404);
      }

      if (order.salesCategory !== "SALES") {
        throw new ApiError(
          "Hanya Sales Order yang dapat dihapus melalui fitur ini",
          400,
        );
      }

      if (
        !allowedStatuses.includes(
          order.status as (typeof allowedStatuses)[number],
        )
      ) {
        throw new ApiError(
          "Maaf, Sales Order tidak dapat dihapus karena sudah dalam proses.",
          400,
        );
      }

      const processedRelations = Object.entries(order._count).filter(
        ([, count]) => count > 0,
      );

      if (processedRelations.length > 0) {
        throw new ApiError(
          `Sales Order tidak dapat dihapus karena memiliki data terkait: ${processedRelations
            .map(([relation]) => relation)
            .join(", ")}`,
          400,
        );
      }

      await tx.orderProduct.deleteMany({
        where: { orderId: id },
      });

      await tx.orderSampleFollowUp.deleteMany({
        where: { orderId: id },
      });

      await tx.sampleProductHistory.deleteMany({
        where: { orderId: id },
      });

      await tx.clientPurchaseOrder.deleteMany({
        where: { orderId: id },
      });

      const deleted = await tx.order.deleteMany({
        where: {
          id,
          status: { in: ["PENDING", "CANCELLED"] },
          salesCategory: "SALES",
        },
      });

      if (deleted.count !== 1) {
        throw new ApiError(
          "Order tidak dapat dihapus karena statusnya telah berubah",
          409,
        );
      }

      return {
        message: "Sales Order berhasil dihapus",
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
        },
      };
    });
  }

  async getOrderForUpdate(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        products: true,
        sampleFollowUps: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      throw new ApiError(`Order with ID ${id} not found`, 404);
    }

    return {
      // === ORDER CORE ===
      orderNumber: order.orderNumber || "",
      dateOrder: order.dateOrder.toISOString().split("T")[0],
      salesCategory: order.salesCategory,
      clientPoNumber: order.clientPoNumber || "",
      remark: order.remark || "",
      currencyCode: order.currencyCode || "IDR",
      warrantyDays: order.warrantyDays ?? 0,
      status: order.status,

      // === DOCUMENT REFERENCES ===
      referenceQuotationId: order.referenceQuotationId || "",
      referenceSampleId: order.referenceSampleId || "",

      // === CUSTOMER & LOGISTICS ===
      clientId: order.clientId,
      clientB2BPICId: order.clientB2BPICId || "",
      purchaseChannelId: order.purchaseChannelId || "",
      salesId: order.salesId || "",
      shippingAddress: order.shippingAddress,

      // === VENDORS (Dihapus dari Form Update Order) ===
      // Vendor sekarang dikelola melalui Purchase Order,
      // sehingga tidak lagi dimuat di Form Update Order.

      // === PRODUCTS ===
      products: order.products.map((p) => {
        let customVal = "";
        if (
          p.customization &&
          typeof p.customization === "object" &&
          "detail" in p.customization
        ) {
          customVal = (p.customization as any).detail;
        } else if (typeof p.customization === "string") {
          try {
            const parsed = JSON.parse(p.customization);
            customVal = parsed.detail || "";
          } catch {}
        }

        return {
          productId: p.productId,
          variantId: p.variantId || "",
          quantity: p.quantity,
          price: Number(p.unitPrice),
          customization: customVal,
          remarks: p.remarks || "",
          selectedAttributes: p.selectedAttributes || {},
        };
      }),

      // === SAMPLE FOLLOW UPS ===
      sampleFollowUps: order.sampleFollowUps.map((fu) => ({
        id: fu.id,
        name: fu.name || "",
        date: fu.date ? fu.date.toISOString() : null,
        method: fu.method || "",
        notes: fu.notes || "",
        nextAction: fu.nextAction || "",
        isDone: fu.isDone,
      })),
    };
  }

  async getOrderForDetail(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        purchaseChannel: true,
        pic: true,
        currency: true,
        client: {
          include: {
            b2b: { include: { department: true } },
            b2c: true,
          },
        },
        createdBy: true,
        //  TAMBAHAN BARU: Sertakan data Client Purchase Order
        clientPurchaseOrder: true,

        products: {
          include: {
            product: true,
            variant: true,
          },
        },
        purchaseOrderItems: {
          include: {
            purchaseOrder: {
              include: {
                vendor: {
                  include: {
                    contacts: {
                      include: {
                        platform: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        invoices: true,
        sampleFollowUps: {
          orderBy: { date: "asc" },
        },
      },
    });

    if (!order) {
      throw new ApiError(`Order with ID ${id} not found`, 404);
    }

    const activeInvoices = await this.prisma.invoice.findMany({
      where: {
        orderId: id,
        status: { not: "CANCELLED" },
      },
      include: {
        items: true,
      },
    });

    const activeInvoiceIds = activeInvoices.map((inv) => inv.id);
    const billedAmountByProduct = new Map<string, number>();

    for (const invoice of activeInvoices) {
      const invoiceItemsTotal = invoice.items.reduce(
        (sum, item) => sum + Number(item.price) * item.quantity,
        0,
      );

      for (const item of invoice.items) {
        const key = `${item.productId}_${item.variantId ?? "null"}`;
        const itemBaseAmount = Number(item.price) * item.quantity;
        const proportion =
          invoiceItemsTotal > 0 ? itemBaseAmount / invoiceItemsTotal : 0;
        const paidForThisItem = Number(invoice.totalAmount) * proportion;

        billedAmountByProduct.set(
          key,
          (billedAmountByProduct.get(key) || 0) + paidForThisItem,
        );
      }
    }

    const billedItems =
      activeInvoiceIds.length > 0
        ? await this.prisma.invoiceItem.findMany({
            where: {
              invoiceId: { in: activeInvoiceIds },
            },
          })
        : [];

    // 3. Client Info Logic
    let clientInfo = {
      name: "",
      phone: "",
      email: "",
      type: order.client.type,
      picName: "-",
      picPhone: "-",
    };

    if (order.client.b2b) {
      clientInfo.name = order.client.b2b.companyName;
      clientInfo.phone = order.client.b2b.phone || "-";
      clientInfo.email = order.client.b2b.email || "-";
      if (order.pic) {
        clientInfo.picName = order.pic.name;
        clientInfo.picPhone = order.pic.phone || "-";
      }
    } else if (order.client.b2c) {
      clientInfo.name = order.client.b2c.name;
      clientInfo.phone = order.client.b2c.phone || "-";
      clientInfo.picName = order.client.b2c.name;
    }

    // 4. Products Detail Mapping dengan Perhitungan SISA
    const productsDetail = order.products.map((p) => {
      let customizationDetail = "-";
      if (p.customization) {
        try {
          const cObj =
            typeof p.customization === "string"
              ? JSON.parse(p.customization)
              : p.customization;
          if (cObj && typeof cObj === "object" && "detail" in cObj) {
            customizationDetail = (cObj as any).detail;
          } else if (cObj) {
            customizationDetail = JSON.stringify(cObj);
          }
        } catch (e) {
          customizationDetail = String(p.customization);
        }
      }
      const totalItemPrice = Number(p.unitPrice) * p.quantity;
      const currentBilledQty = billedItems
        .filter(
          (item) =>
            item.productId === p.productId && item.variantId === p.variantId,
        )
        .reduce((sum, item) => sum + item.quantity, 0);
      const remainingQty = Math.max(0, p.quantity - currentBilledQty);

      const key = `${p.productId}_${p.variantId ?? "null"}`;
      const currentBilledAmount = billedAmountByProduct.get(key) || 0;
      const remainingBilledAmount = Math.max(
        0,
        totalItemPrice - currentBilledAmount,
      );

      return {
        id: p.id,
        productId: p.productId,
        variantId: p.variantId,
        productName: p.product?.name || "Unknown Product",
        sku: p.product?.sku || "-",
        variantName: p.variant ? p.variant.variantName || "-" : "-",
        quantity: p.quantity,
        unitPrice: Number(p.unitPrice),
        totalPrice: Number(p.unitPrice) * p.quantity,
        customization: customizationDetail,
        remarks: p.remarks || "-",
        selectedAttributes: p.selectedAttributes || {},

        billedQuantity: currentBilledQty,
        remainingQuantity: remainingQty,
        billedAmount: currentBilledAmount,
        remainingBilledAmount: remainingBilledAmount,
      };
    });

    // Mapping Vendor dari Purchase Order
    const uniqueVendorsMap = new Map();

    if (order.purchaseOrderItems && order.purchaseOrderItems.length > 0) {
      order.purchaseOrderItems.forEach((poi) => {
        const po = poi.purchaseOrder;

        if (po && po.vendor && !uniqueVendorsMap.has(po.vendor.id)) {
          const vendorData = po.vendor as any;

          let contactDisplay = "-";

          if (vendorData.contacts && vendorData.contacts.length > 0) {
            const primaryContact =
              vendorData.contacts.find((c: any) => c.isPrimary) ||
              vendorData.contacts[0];

            const platformName = primaryContact.platform?.name || "Kontak";
            contactDisplay = `${primaryContact.contactId} (${platformName})`;
          }

          uniqueVendorsMap.set(vendorData.id, {
            id: vendorData.id,
            companyName: vendorData.companyName,
            picName: vendorData.picName || "-",
            picPhone: contactDisplay,
            role: "Supplier (via PO)",
          });
        }
      });
    }
    const vendorsDetail = Array.from(uniqueVendorsMap.values());

    // 6. Invoices Mapping
    const invoicesDetail = order.invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      totalAmount: Number(inv.totalAmount),
      status: inv.status,
      category: inv.category,
      dueDate: inv.dueDate,
      createdAt: inv.createdAt,
      method: inv.method,
    }));

    // === RETURN OBJECT ===
    return {
      id: order.id,
      orderNumber: order.orderNumber || "-",
      dateOrder: order.dateOrder,
      status: order.status,
      salesCategory: order.salesCategory,
      shippingAddress: order.shippingAddress,
      totalAmount: Number(order.totalAmount),
      currencyCode: order.currency?.code || "IDR",
      createdAt: order.createdAt,
      purchaseChannelName: order.purchaseChannel
        ? order.purchaseChannel.name
        : "-",
      clientInfo: clientInfo,

      sales: {
        name: order.createdBy?.name || "System",
        phone: (order.createdBy as any)?.phone || "-",
      },

      products: productsDetail,
      vendors: vendorsDetail,
      invoices: invoicesDetail,
      sampleFollowUps: order.sampleFollowUps.map((fu) => ({
        id: fu.id,
        name: fu.name,
        date: fu.date,
        isDone: fu.isDone,
        createdAt: fu.createdAt,
      })),

      //  TAMBAHAN BARU: Kirim data PO client ke frontend
      clientPurchaseOrder: order.clientPurchaseOrder
        ? {
            id: order.clientPurchaseOrder.id,
            poNumber: order.clientPurchaseOrder.poNumber,
            fileUrl: order.clientPurchaseOrder.fileUrl,
            fileName: order.clientPurchaseOrder.fileName,
            fileType: order.clientPurchaseOrder.fileType,
          }
        : null,
    };
  }

  async getAllOrders(query: {
    page?: number;
    take?: number;
    search?: string;
    salesCategory?: string;
    startDate?: string;
    endDate?: string;
    purchaseChannelId?: string; //  TAMBAHAN TIPE DATA
  }) {
    const where: any = {};

    if (query.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { orderNumber: { contains: searchTerm } },
        { clientPoNumber: { contains: searchTerm } },
        {
          client: {
            b2b: { is: { companyName: { contains: searchTerm } } },
          },
        },
        {
          client: {
            b2c: { is: { name: { contains: searchTerm } } },
          },
        },
        {
          pic: { is: { name: { contains: searchTerm } } },
        },
        {
          createdBy: { is: { name: { contains: searchTerm } } },
        },
      ];
    }

    if (query.salesCategory) {
      where.salesCategory = query.salesCategory;
    }

    //  TAMBAHAN LOGIKA FILTER PURCHASE CHANNEL
    if (query.purchaseChannelId && query.purchaseChannelId !== "ALL") {
      where.purchaseChannelId = query.purchaseChannelId;
    }

    // 3. Filter Tanggal
    if (query.startDate || query.endDate) {
      const dateFilter: any = {};
      if (query.startDate) {
        const start = new Date(query.startDate);
        if (!isNaN(start.getTime())) dateFilter.gte = start;
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        if (!isNaN(end.getTime())) {
          end.setDate(end.getDate() + 1);
          dateFilter.lt = end;
        }
      }
      if (Object.keys(dateFilter).length > 0) {
        where.dateOrder = dateFilter;
      }
    }

    // === Query Database ===
    const count = await this.prisma.order.count({ where });

    const orders = await this.prisma.order.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          include: {
            b2c: true,
            b2b: {
              include: { pics: { select: { name: true } } },
            },
          },
        },
        pic: { select: { name: true } },
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
        referenceQuotation: { select: { quotationNumber: true } },
        referenceSample: { select: { orderNumber: true } },
        purchaseChannel: { select: { id: true, name: true } }, //  TAMBAHAN AGAR CHANNEL KETAMPIL JIKA PERLU
        shipments: {
          where: { type: "OUTBOUND" },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { createdAt: true, departureDate: true, arrivalDate: true },
        },
        productionTrackers: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { status: true },
        },
        sampleFollowUps: {
          orderBy: { date: "desc" },
          take: 1,
          select: { date: true, notes: true },
        },
        _count: {
          select: { products: true },
        },
      },
    });

    // === Format Ulang Data (Data Mapping) ===
    const formattedData = orders.map((order) => {
      let clientName = "-";
      let picCustomer: string | null = null;

      if (order.client?.b2b) {
        clientName = order.client.b2b.companyName;
        picCustomer =
          order.pic?.name ||
          (order.client.b2b.pics && order.client.b2b.pics.length > 0
            ? order.client.b2b.pics[0].name
            : "-");
      } else if (order.client?.b2c) {
        clientName = order.client.b2c.name;
        picCustomer = null;
      }

      const lastShipment =
        order.shipments.length > 0 ? order.shipments[0] : null;
      const lastProduction =
        order.productionTrackers.length > 0
          ? order.productionTrackers[0]
          : null;
      const lastFollowUp =
        order.sampleFollowUps.length > 0 ? order.sampleFollowUps[0] : null;

      return {
        id: order.id,
        orderDate: order.dateOrder,
        orderNumber: order.orderNumber || "-",
        customerName: clientName,
        shippingAddress: order.shippingAddress,
        picCustomer: picCustomer,
        clientPoNumber: order.clientPoNumber || "-",
        sampleReference: order.referenceSample?.orderNumber || "-",
        quotationReference: order.referenceQuotation?.quotationNumber || "-",

        remark: order.remark || "-",
        status: order.status,

        productionData: lastProduction?.status || "-",
        packagingDate: lastShipment?.createdAt || null,
        shippingDate: lastShipment?.createdAt || null,
        sendToCustDate: lastShipment?.departureDate || null,
        arrivalInCustDate: lastShipment?.arrivalDate || null,

        lastFollowUpDate: lastFollowUp?.date || null,
        lastFollowUpNotes: lastFollowUp?.notes || "-",
        createdBy: order.createdBy?.name || "System",
        createdTime: order.createdAt,
        updatedBy: order.updatedBy?.name || "-",
        updatedTime: order.updatedAt,

        totalAmount: Number(order.totalAmount),
        currencyCode: order.currencyCode,
        salesCategory: order.salesCategory,

        //  TAMBAHAN INFORMASI PURCHASE CHANNEL KE FORMAT RESPONSE
        purchaseChannel: order.purchaseChannel
          ? order.purchaseChannel.name
          : "-",
        purchaseChannelId: order.purchaseChannelId || null,

        salesName: order.createdBy?.name || "-",

        totalItems: order._count.products,
      };
    });

    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 10),
    });

    return { data: formattedData, meta };
  }

  async exportOrdersToExcel(query: OrderExportQuery): Promise<Buffer> {
    const { startDate, endDate, search, salesCategory } = query;

    const where: any = {};

    // 1. Filter Tanggal (Date Range)
    if (startDate || endDate) {
      where.dateOrder = {};
      if (startDate) {
        where.dateOrder.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.dateOrder.lt = end;
      }
    }

    // 2. Filter Pencarian (Order Number atau Nama Client)
    if (search) {
      where.OR = [
        { orderNumber: { contains: search } },
        { client: { b2b: { companyName: { contains: search } } } },
        { client: { b2c: { name: { contains: search } } } },
      ];
    }

    // 3. Filter Kategori Sales
    if (salesCategory) {
      where.salesCategory = salesCategory;
    }

    // 4. FETCH DATA
    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { dateOrder: "desc" },
      include: {
        client: {
          include: { b2b: true, b2c: true },
        },
        sales: {
          select: { name: true },
        },
        products: {
          include: {
            product: { select: { name: true, sku: true } },
            variant: { select: { variantName: true } },
          },
        },
        purchaseOrderItems: {
          include: {
            purchaseOrder: {
              include: {
                vendor: { select: { companyName: true } },
              },
            },
          },
        },
      },
    });

    // 5. SETUP WORKBOOK
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Orders");

    // Definisi Kolom (Header diganti menjadi Order Number)
    worksheet.columns = [
      { header: "Order Number", key: "orderNumber", width: 20 },
      { header: "Tanggal Order", key: "dateOrder", width: 20 },
      { header: "Kategori", key: "salesCategory", width: 15 },
      { header: "Nama Client", key: "clientName", width: 30 },
      { header: "Tipe Client", key: "clientType", width: 15 },
      { header: "Sales Rep", key: "salesName", width: 20 },
      { header: "Total Amount (Rp)", key: "totalAmount", width: 25 },
      { header: "Detail Produk (Qty x Nama)", key: "products", width: 60 },
      { header: "Vendors", key: "vendors", width: 40 },
      { header: "Alamat Pengiriman", key: "address", width: 40 },
    ];

    // 6. POPULASI DATA
    orders.forEach((order) => {
      let clientName = "-";
      let clientType = order.client.type;
      if (order.client.b2b) {
        clientName = order.client.b2b.companyName;
      } else if (order.client.b2c) {
        clientName = order.client.b2c.name;
      }

      const productsString = order.products
        .map((p) => {
          const variantName = p.variant ? `(${p.variant.variantName})` : "";
          return `${p.quantity}x ${p.product.name} ${variantName} @${Number(p.unitPrice).toLocaleString("id-ID")}`;
        })
        .join("\n");

      const uniqueVendors = Array.from(
        new Set(
          order.purchaseOrderItems.map(
            (poi) => poi.purchaseOrder.vendor.companyName,
          ),
        ),
      );

      const vendorsString =
        uniqueVendors.length > 0 ? uniqueVendors.join("\n") : "-";

      worksheet.addRow({
        orderNumber: order.orderNumber,
        dateOrder: order.dateOrder,
        salesCategory: order.salesCategory,
        clientName: clientName,
        clientType: clientType,
        salesName: order.sales?.name || "-",
        totalAmount: Number(order.totalAmount),
        products: productsString,
        vendors: vendorsString,
        address: order.shippingAddress,
      });
    });

    // 7. FORMATTING
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "00A86B" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.getCell(2).numFmt = "dd/mm/yyyy";
        row.getCell(7).numFmt = "#,##0";
        row.alignment = { vertical: "top" };
        row.getCell(8).alignment = { vertical: "top", wrapText: true };
        row.getCell(9).alignment = { vertical: "top", wrapText: true };
        row.getCell(10).alignment = { vertical: "top", wrapText: true };
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }

  async getOrderForTracking(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        client: {
          include: {
            b2b: { select: { companyName: true } },
            b2c: { select: { name: true } },
          },
        },
        products: {
          include: {
            product: { select: { name: true, sku: true } },
            productionTrackers: {
              include: {
                vendor: { select: { companyName: true, trackingUrl: true } },
              },
              orderBy: { startDate: "desc" },
            },
          },
        },
        shipments: {
          include: {
            vendor: { select: { companyName: true, trackingUrl: true } },
            items: {
              include: {
                orderProduct: {
                  include: {
                    product: { select: { name: true } },
                  },
                },
              },
            },
            history: {
              orderBy: { date: "desc" },
            },
            notes: {
              include: {
                category: true,
              },
            },
          },
          orderBy: { departureDate: "desc" },
        },
      },
    });

    if (!order) {
      throw new ApiError(`Order with ID ${id} not found`, 404);
    }

    // Helper kalkulasi hari (tetap sama)
    const diffDays = (start: Date | null, end: Date | null): number => {
      if (!start || !end) return 0;
      const startDate = new Date(start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(end);
      endDate.setHours(0, 0, 0, 0);
      const diffTime = endDate.getTime() - startDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays + 1;
    };

    // Mapping Data Products (tetap sama)
    const productsFormatted = order.products.map((p) => {
      const producedQty = p.productionTrackers.reduce(
        (sum, t) => sum + (t.status === "COMPLETED" ? t.quantity : 0),
        0,
      );

      return {
        id: p.id,
        productId: p.productId,
        productName: p.product.name,
        sku: p.product.sku,
        quantity: p.quantity,
        productionTrackers: p.productionTrackers.map((t) => ({
          id: t.id,
          step: t.step,
          vendorId: t.vendorId,
          quantity: t.quantity,
          startDate: t.startDate,
          endDate: t.endDate,
          status: t.status,
          vendor: t.vendor,
          remarks: t.remarks ?? null,
        })),
        producedQuantity: producedQty,
        remainingProduction: Math.max(0, p.quantity - producedQty),
      };
    });

    // Kalkulasi Duration Summary (tetap sama)
    const durationSummary = (() => {
      // ... (Logika durationSummary Anda tidak perlu diubah, tetap sama)
      const allTrackers = order.products.flatMap((p) => p.productionTrackers);
      const prodStarts = allTrackers
        .map((t) => t.startDate)
        .filter(Boolean) as Date[];
      const prodEnds = allTrackers
        .map((t) => t.endDate)
        .filter(Boolean) as Date[];

      const prodStart = prodStarts.length
        ? new Date(Math.min(...prodStarts.map((d) => d.getTime())))
        : null;
      const prodEnd = prodEnds.length
        ? new Date(Math.max(...prodEnds.map((d) => d.getTime())))
        : null;
      const productionDays = diffDays(prodStart, prodEnd);

      const inboundShipments = order.shipments.filter(
        (s) => s.type === "INBOUND",
      );
      const inboundStart = inboundShipments.length
        ? new Date(
            Math.min(
              ...inboundShipments.map((s) =>
                new Date(s.departureDate || s.createdAt).getTime(),
              ),
            ),
          )
        : null;
      const inboundEnd =
        inboundShipments.length > 0 &&
        inboundShipments.every((s) => s.arrivalDate)
          ? new Date(
              Math.max(
                ...inboundShipments.map((s) =>
                  new Date(s.arrivalDate!).getTime(),
                ),
              ),
            )
          : null;
      const inboundDays = diffDays(inboundStart, inboundEnd);

      const outboundShipments = order.shipments.filter(
        (s) => s.type === "OUTBOUND",
      );
      const outboundStart = outboundShipments.length
        ? new Date(
            Math.min(
              ...outboundShipments.map((s) =>
                new Date(s.departureDate || s.createdAt).getTime(),
              ),
            ),
          )
        : null;
      const outboundEnd =
        outboundShipments.length > 0 &&
        outboundShipments.every((s) => s.arrivalDate)
          ? new Date(
              Math.max(
                ...outboundShipments.map((s) =>
                  new Date(s.arrivalDate!).getTime(),
                ),
              ),
            )
          : null;
      const outboundDays = diffDays(outboundStart, outboundEnd);

      const totalStart = prodStart || inboundStart || outboundStart;
      const totalEnd = outboundEnd || inboundEnd || prodEnd || new Date();
      const totalDays = diffDays(totalStart, totalEnd);

      return {
        production: {
          days: productionDays,
          startDate: prodStart,
          endDate: prodEnd,
          isComplete:
            allTrackers.length > 0 && allTrackers.every((t) => t.endDate),
        },
        inbound: {
          days: inboundDays,
          startDate: inboundStart,
          endDate: inboundEnd,
          isComplete: inboundShipments.length > 0 && inboundEnd !== null,
        },
        outbound: {
          days: outboundDays,
          startDate: outboundStart,
          endDate: outboundEnd,
          isComplete: outboundShipments.length > 0 && outboundEnd !== null,
        },
        total: {
          days: totalDays,
          startDate: totalStart,
          endDate: outboundEnd,
          isComplete: outboundEnd !== null,
        },
      };
    })();

    return {
      id: order.id,
      orderNumber: order.orderNumber || "-",
      client: order.client,
      products: productsFormatted,
      shipments: order.shipments,
      durationSummary,
    };
  }

  async getSampleStats() {
    const aggregate = await this.prisma.order.aggregate({
      where: {
        salesCategory: "SAMPLE",
      },
      _count: {
        id: true,
      },
      _sum: {
        totalAmount: true,
      },
    });

    const totalCount = aggregate._count.id;
    const totalCost = Number(aggregate._sum.totalAmount) || 0;

    const sampleClients = await this.prisma.order.findMany({
      where: { salesCategory: "SAMPLE" },
      select: { clientId: true },
      distinct: ["clientId"],
    });

    const sampleClientIds = sampleClients.map((o) => o.clientId);
    const totalUniqueSampleClients = sampleClientIds.length;

    let convertedClientsCount = 0;

    if (totalUniqueSampleClients > 0) {
      const convertedClients = await this.prisma.order.groupBy({
        by: ["clientId"],
        where: {
          clientId: { in: sampleClientIds },
          salesCategory: "SALES",
        },
      });

      convertedClientsCount = convertedClients.length;
    }

    const conversionRate =
      totalUniqueSampleClients > 0
        ? (convertedClientsCount / totalUniqueSampleClients) * 100
        : 0;

    return {
      totalCount,
      totalCost,
      conversionRate: parseFloat(conversionRate.toFixed(2)),
    };
  }

  async generatePoNumberAPI(
    salesCategory: "SALES" | "SAMPLE",
  ): Promise<string> {
    try {
      const totalOrdersByCategory = await this.prisma.order.count({
        where: {
          salesCategory: salesCategory,
        },
      });

      const sequence = String(totalOrdersByCategory + 1).padStart(4, "0");

      const prefix = salesCategory === "SALES" ? "GI-SO" : "GI-SN";

      return `${prefix}${sequence}`;
    } catch (error) {
      console.error("🔥 Gagal men-generate PO/SO Number:", error);
      throw new ApiError("Gagal membuat nomor referensi otomatis.", 500);
    }
  }

  async getGeneralOrderStats() {
    try {
      // 1. Hitung Semua Order
      const totalOrders = await this.prisma.order.count();

      // 2. Hitung On-Going Orders
      // Asumsi On-Going:
      // - Order belum punya invoice sama sekali (baru dibuat)
      // - ATAU Order punya invoice tapi statusnya masih UNPAID / DRAFT / OVERDUE
      const ongoingOrders = await this.prisma.order.count({
        where: {
          OR: [
            {
              invoices: {
                none: {}, // Belum ada invoice sama sekali
              },
            },
            {
              invoices: {
                some: {
                  status: {
                    in: ["UNPAID", "DRAFT", "OVERDUE"],
                  },
                },
              },
            },
          ],
        },
      });

      return {
        data: {
          totalOrders,
          ongoingOrders,
        },
      };
    } catch (error) {
      throw new Error(
        "Gagal mengambil statistik order: " + getErrorMessage(error),
      );
    }
  }

  // ====================================================================
  // GET SAMPLE REFERENCES (Hanya ID dan Nomor untuk Dropdown Order)
  // ====================================================================
  async getSampleOrderReferences() {
    try {
      return await this.prisma.order.findMany({
        where: {
          salesCategory: "SAMPLE",
          resultingOrders: {
            none: {},
          },
        },
        select: {
          id: true,
          orderNumber: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    } catch (error) {
      console.error("🔥 GET SAMPLE REFERENCES ERROR:", error);
      throw new ApiError("Gagal mengambil daftar referensi order sample.", 500);
    }
  }

  // ===============================================
  // ANALYTICS & CHART DATA
  // ===============================================
  async getSalesAnalytics(year?: number) {
    const currentYear = year || new Date().getFullYear();

    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Ags",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];

    const orders = await this.prisma.order.findMany({
      where: {
        dateOrder: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31`),
        },
      },
      select: {
        dateOrder: true,
        totalAmount: true,

        cashflowSummary: {
          select: {
            profitLoss: true,
          },
        },
      },
    });

    const chartData = months.map((month) => ({
      name: month,
      orders: 0,
      profit: 0,
      revenue: 0,
    }));

    orders.forEach((order) => {
      const monthIndex = new Date(order.dateOrder).getMonth();

      chartData[monthIndex].orders += 1;

      if (order.cashflowSummary && order.cashflowSummary.length > 0) {
        chartData[monthIndex].profit += Number(
          order.cashflowSummary[0].profitLoss,
        );
      } else {
        const revenue = Number(order.totalAmount);
        chartData[monthIndex].revenue += revenue;

        chartData[monthIndex].profit += revenue * 0.2;
      }
    });

    return chartData;
  }

  // ===============================================
  // METRICS / DASHBOARD SUMMARY
  // ===============================================
  async getSalesMetrics() {
    const now = new Date();

    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfCurrentMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    );

    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // --- HELPER FUNCTION UNTUK QUERY AGREGAT ---
    const getMetricsByDateRange = async (start: Date, end: Date) => {
      const orderAgg = await this.prisma.order.aggregate({
        where: {
          dateOrder: { gte: start, lte: end },
        },
        _sum: { totalAmount: true },
        _count: { id: true },
      });

      const expenseAgg = await this.prisma.financeTransaction.aggregate({
        where: {
          transactionDate: { gte: start, lte: end },
          type: "EXPENSE",
        },
        _sum: { amount: true },
      });

      const otherIncomeAgg = await this.prisma.financeTransaction.aggregate({
        where: {
          transactionDate: { gte: start, lte: end },
          type: "INCOME",
        },
        _sum: { amount: true },
      });

      const revenueFromOrders = Number(orderAgg._sum.totalAmount) || 0;
      const revenueFromFinance = Number(otherIncomeAgg._sum.amount) || 0;
      const totalSpending = Number(expenseAgg._sum.amount) || 0;

      const totalRevenue = revenueFromOrders + revenueFromFinance;
      const totalOrders = orderAgg._count.id;

      const totalProfit = totalRevenue - totalSpending;

      return { totalRevenue, totalProfit, totalOrders, totalSpending };
    };

    // 2. Eksekusi Query secara Paralel
    const [current, last] = await Promise.all([
      getMetricsByDateRange(startOfCurrentMonth, endOfCurrentMonth),
      getMetricsByDateRange(startOfLastMonth, endOfLastMonth),
    ]);

    // 3. Hitung Persentase Perubahan
    const calculatePercentage = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    return {
      totalRevenue: current.totalRevenue,
      revenueChange: calculatePercentage(
        current.totalRevenue,
        last.totalRevenue,
      ),

      totalProfit: current.totalProfit,
      profitChange: calculatePercentage(current.totalProfit, last.totalProfit),

      totalOrders: current.totalOrders,
      ordersChange: current.totalOrders - last.totalOrders,

      totalSpending: current.totalSpending,
      spendingChange: calculatePercentage(
        current.totalSpending,
        last.totalSpending,
      ),
    };
  }

  async checkExpiredWarranties() {
    try {
      const today = new Date();

      const result = await this.prisma.orderWarranty.updateMany({
        where: {
          status: "ACTIVE",
          expiryDate: { lt: today },
        },
        data: {
          status: "EXPIRED",
        },
      });

      if (result.count > 0) {
        console.log(
          `✅ [CRON] Berhasil mengupdate ${result.count} garansi menjadi EXPIRED.`,
        );
      }
    } catch (error) {
      console.error("❌ [CRON ERROR] Gagal mengecek garansi expired:", error);
    }
  }

  // =================================================================
  // GET ORDER FOR REPLACEMENT AUTO-FILL
  // =================================================================
  async getOrderForReplacement(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        clientId: true,
        currencyCode: true,
        products: {
          select: {
            productId: true,
            variantId: true,
            quantity: true,
            unitPrice: true,
            customization: true,
            selectedAttributes: true,
            remarks: true,
          },
        },
      },
    });

    if (!order) {
      throw new ApiError(`Order with ID ${id} not found`, 404);
    }

    return order;
  }

  async getAllCombinedOrders(query: {
    page?: number;
    take?: number;
    search?: string;
    startDate?: string;
    endDate?: string;
    purchaseChannelId?: string;
  }) {
    const {
      page = 1,
      take = 10,
      search,
      startDate,
      endDate,
      purchaseChannelId,
    } = query;
    const skip = (Number(page) - 1) * Number(take);

    // 1. Siapkan Filter Pencarian
    const orderWhere: any = {};
    const replacementWhere: any = {};

    //  TAMBAHAN: Filter berdasarkan purchaseChannelId (Hanya untuk Order)
    if (purchaseChannelId && purchaseChannelId !== "ALL") {
      orderWhere.purchaseChannelId = purchaseChannelId;
    }

    if (search) {
      const searchTerm = search.trim();

      orderWhere.OR = [
        { orderNumber: { contains: searchTerm, mode: "insensitive" } },
        { clientPoNumber: { contains: searchTerm, mode: "insensitive" } },
        {
          client: {
            b2b: { companyName: { contains: searchTerm, mode: "insensitive" } },
          },
        },
        {
          client: {
            b2c: { name: { contains: searchTerm, mode: "insensitive" } },
          },
        },
        { pic: { name: { contains: searchTerm, mode: "insensitive" } } },
        { createdBy: { name: { contains: searchTerm, mode: "insensitive" } } },
      ];

      replacementWhere.OR = [
        { replacementNumber: { contains: searchTerm, mode: "insensitive" } },
        {
          referenceOrder: {
            orderNumber: { contains: searchTerm, mode: "insensitive" },
          },
        },
        {
          client: {
            b2b: { companyName: { contains: searchTerm, mode: "insensitive" } },
          },
        },
        {
          client: {
            b2c: { name: { contains: searchTerm, mode: "insensitive" } },
          },
        },
        { pic: { name: { contains: searchTerm, mode: "insensitive" } } },
        { createdBy: { name: { contains: searchTerm, mode: "insensitive" } } },
      ];
    }

    // 2. Siapkan Filter Tanggal
    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) dateFilter.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          end.setDate(end.getDate() + 1);
          dateFilter.lt = end;
        }
      }
      if (Object.keys(dateFilter).length > 0) {
        orderWhere.dateOrder = dateFilter;
        replacementWhere.replacementDate = dateFilter;
      }
    }

    const [orders, replacements] = await Promise.all([
      // Ambil Semua Order
      this.prisma.order.findMany({
        where: orderWhere,
        include: {
          client: {
            include: {
              b2c: true,
              b2b: { include: { pics: { select: { name: true } } } },
            },
          },
          pic: { select: { name: true } },
          createdBy: { select: { name: true } },
          updatedBy: { select: { name: true } },
          referenceQuotation: { select: { quotationNumber: true } },
          referenceSample: { select: { orderNumber: true } },
          purchaseChannel: { select: { id: true, name: true } }, //  TAMBAHAN: Ambil data purchase channel
          shipments: {
            where: { type: "OUTBOUND" },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { createdAt: true, departureDate: true, arrivalDate: true },
          },
          _count: { select: { products: true } },
        },
      }),

      // Ambil Semua Replacement
      this.prisma.replacementOrder.findMany({
        where: replacementWhere,
        include: {
          client: {
            include: {
              b2c: true,
              b2b: { include: { pics: { select: { name: true } } } },
            },
          },
          pic: { select: { name: true } },
          createdBy: { select: { name: true } },
          updatedBy: { select: { name: true } },
          referenceOrder: {
            select: {
              orderNumber: true,
              shippingAddress: true,
              currencyCode: true,
            },
          },
          _count: { select: { items: true } },
        },
      }),
    ]);

    let combinedData: any[] = [];

    // Format Order
    orders.forEach((order) => {
      let clientName = "-";
      let picCustomer = order.pic?.name || "-";

      if (order.client?.b2b) {
        clientName = order.client.b2b.companyName;
        if (picCustomer === "-" && order.client.b2b.pics?.length > 0)
          picCustomer = order.client.b2b.pics[0].name;
      } else if (order.client?.b2c) {
        clientName = order.client.b2c.name;
      }

      const lastShipment =
        order.shipments.length > 0 ? order.shipments[0] : null;

      combinedData.push({
        id: order.id,
        type: "ORDER",
        orderDate: order.dateOrder,
        orderNumber: order.orderNumber || "-",
        customerName: clientName,
        picCustomer: picCustomer,
        status: order.status,
        clientPoNumber: order.clientPoNumber || "-",
        totalAmount: Number(order.totalAmount),
        currencyCode: order.currencyCode,
        totalItems: order._count.products,
        salesName: order.createdBy?.name || "-",
        sampleReference: order.referenceSample?.orderNumber || "-",
        quotationReference: order.referenceQuotation?.quotationNumber || "-",
        sendToCustDate: lastShipment?.departureDate || null,
        arrivalInCustDate: lastShipment?.arrivalDate || null,
        shippingAddress: order.shippingAddress || "-",
        remark: order.remark || "-",
        createdBy: order.createdBy?.name || "System",
        createdTime: order.createdAt,
        updatedBy: order.updatedBy?.name || "-",
        updatedTime: order.updatedAt,
        salesCategory: order.salesCategory,
        //  TAMBAHAN: Menyertakan informasi purchase channel pada hasil mapping
        purchaseChannel: order.purchaseChannel
          ? order.purchaseChannel.name
          : "-",
        purchaseChannelId: order.purchaseChannelId || null,
      });
    });

    // Format Replacement Order (Khusus Pencatatan Internal)
    replacements.forEach((rep) => {
      let clientName = "-";
      let picCustomer = rep.pic?.name || "-";

      if (rep.client?.b2b) {
        clientName = rep.client.b2b.companyName;
        if (picCustomer === "-" && rep.client.b2b.pics?.length > 0)
          picCustomer = rep.client.b2b.pics[0].name;
      } else if (rep.client?.b2c) {
        clientName = rep.client.b2c.name;
      }

      combinedData.push({
        id: rep.id,
        type: "REPLACEMENT",
        orderDate: rep.replacementDate,
        orderNumber: rep.replacementNumber || "-",
        customerName: clientName,
        picCustomer: picCustomer,
        status: "REPLACEMENT",

        clientPoNumber: "-",

        totalAmount: 0,
        currencyCode: rep.referenceOrder?.currencyCode || "IDR",

        totalItems: rep._count?.items || 0,

        salesName: rep.createdBy?.name || "-",
        sampleReference: "-",
        quotationReference: "-",
        sendToCustDate: rep.sendToCustDate || null,
        arrivalInCustDate: rep.arrivalInCustDate || null,
        shippingAddress: rep.referenceOrder?.shippingAddress || "-",
        remark: rep.replacementReason
          ? `${rep.replacementReason} - ${rep.remarks || ""}`
          : rep.remarks || "-",
        createdBy: rep.createdBy?.name || "System",
        createdTime: rep.createdAt,
        updatedBy: rep.updatedBy?.name || "-",
        updatedTime: rep.updatedAt,
        salesCategory: "REPLACEMENT",
        purchaseChannel: "-", // Replacement order tidak memiliki relasi langsung ke purchase channel
        purchaseChannelId: null,
      });
    });

    combinedData.sort(
      (a, b) =>
        new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime(),
    );

    const total = combinedData.length;
    const paginatedData = combinedData.slice(skip, skip + Number(take));

    const meta = {
      page: Number(page),
      take: Number(take),
      total,
      hasPrevious: page > 1,
      hasNext: skip + Number(take) < total,
      perPage: Number(take),
    };

    return { data: paginatedData, meta };
  }

  // ====================================================================
  // METHOD: CANCEL ORDER & DELETE FILE FROM CLOUD & DATABASE
  // ====================================================================
  async cancelOrder(id: string, userId?: string) {
    // 1. Cek apakah order dengan ID tersebut ada beserta data PO client-nya
    const existingOrder = await this.prisma.order.findUnique({
      where: { id },
      include: { clientPurchaseOrder: true },
    });

    if (!existingOrder) {
      throw new ApiError(`Order dengan ID ${id} tidak ditemukan`, 404);
    }

    // 2. Validasi status order
    if (existingOrder.status === "COMPLETED") {
      throw new ApiError(
        "Order yang sudah selesai (COMPLETED) tidak dapat dibatalkan",
        400,
      );
    }

    if (existingOrder.status === "CANCELLED") {
      throw new ApiError("Order ini sudah dibatalkan sebelumnya", 400);
    }

    // 3. Ambil data file PO jika ada untuk dihapus fisiknya dari Cloudinary
    const poFile = existingOrder.clientPurchaseOrder;

    // 4. Jalankan transaksi database dan hapus file fisik
    const result = await this.prisma.$transaction(async (tx) => {
      // A. Hapus record ClientPurchaseOrder dari database jika ada
      if (poFile) {
        await tx.clientPurchaseOrder.delete({
          where: { orderId: id },
        });
      }

      // B. Update status order menjadi CANCELLED
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          status: "CANCELLED",
          updatedById: userId || null,
        },
      });

      return updatedOrder;
    });

    // 5. Hapus file fisik dari Cloudinary di luar transaksi database
    // (Agar jika penghapusan cloud gagal, transaksi database utama tetap aman)
    if (poFile && poFile.fileUrl) {
      try {
        // Memanggil fungsi remove/delete dari CloudinaryService
        await this.cloudinary.remove(poFile.fileUrl);
      } catch (cloudinaryError) {
        console.error(
          "⚠️ Gagal menghapus file fisik dari Cloudinary:",
          cloudinaryError,
        );
        // Proses tetap dilanjutkan karena status order sudah resmi dibatalkan
      }
    }

    return result;
  }
  // ====================================================================
  // METHOD: CEK & HAPUS FILE PO CLIENT (SUPPORT CICILAN & GARANSI)
  // ====================================================================
  async checkAndDeleteClientPoIfNeeded(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        clientPurchaseOrder: true,
        invoices: true,
      },
    });

    if (!order || !order.clientPurchaseOrder) return;

    // Jika order sudah dicancel, file langsung dihapus
    if (order.status === "CANCELLED") {
      await this.executeDeletePo(order.id, order.clientPurchaseOrder);
      return;
    }

    // 1. Cek apakah seluruh tagihan pesanan ini sudah benar-benar lunas
    // Ambil semua invoice aktif (tidak cancelled)
    const activeInvoices = order.invoices.filter(
      (inv) => inv.status !== "CANCELLED",
    );

    // Hitung total uang dari invoice yang sudah berstatus PAID
    const totalPaidAmount = activeInvoices
      .filter((inv) => inv.status === "PAID")
      .reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

    const totalOrderAmount = Number(order.totalAmount);

    // Order dianggap lunas jika total yang dibayar sudah sama dengan (atau melebihi) total order,
    // DAN pastikan minimal sudah ada invoice yang dibuat (activeInvoices.length > 0)
    const isFullyPaid =
      activeInvoices.length > 0 && totalPaidAmount >= totalOrderAmount;

    // 2. Cek apakah masa garansi sudah habis
    let isWarrantyExpired = false;
    if (order.warrantyDays && order.warrantyDays > 0) {
      const orderDate = new Date(order.dateOrder);
      const expiryDate = new Date(orderDate);
      expiryDate.setDate(expiryDate.getDate() + order.warrantyDays);

      const today = new Date();
      isWarrantyExpired = today > expiryDate;
    } else {
      isWarrantyExpired = true;
    }

    // Aturan: Hapus jika "Sudah Lunas Sepenuhnya (Termasuk Cicilan)" ATAU "Garansi Habis"
    if (isFullyPaid || isWarrantyExpired) {
      await this.executeDeletePo(order.id, order.clientPurchaseOrder);
    }
  }

  async getWhoWeAreStats() {
    const DUMMY_CUSTOMERS = 100;
    const DUMMY_PRODUCTS = 500;
    const DUMMY_ORDERS = 300;

    try {
      // 2. Hitung jumlah Order Selesai (Completed Orders)
      const realOrdersCount = await this.prisma.order.count({
        where: { status: "COMPLETED" },
      });

      // 3. Hitung Klien Unik (Happy Customers)
      // Menggunakan groupBy untuk mencari klien yang tidak duplikat dari pesanan selesai
      const uniqueClients = await this.prisma.order.groupBy({
        by: ["clientId"],
        where: { status: "COMPLETED" },
      });
      const realCustomersCount = uniqueClients.length;

      // 4. Hitung Total Produk Dibuat (Products Created)
      // Menggunakan table OrderProduct dan menjumlahkan 'quantity'
      const productsAgg = await this.prisma.orderProduct.aggregate({
        where: {
          order: { status: "COMPLETED" },
        },
        _sum: {
          quantity: true,
        },
      });
      const realProductsCount = Number(productsAgg._sum.quantity || 0);

      // 5. Logika Perbandingan (Gunakan data DB jika lebih besar dari Dummy)
      const finalCustomers = Math.max(realCustomersCount, DUMMY_CUSTOMERS);
      const finalProducts = Math.max(realProductsCount, DUMMY_PRODUCTS);
      const finalOrders = Math.max(realOrdersCount, DUMMY_ORDERS);

      // 6. Format data untuk dikirim ke frontend
      const formattedData = {
        stat1Value: `${finalCustomers.toLocaleString("id-ID")}+`,
        stat1Label: "Happy customers",
        stat2Value: `${finalProducts.toLocaleString("id-ID")}+`,
        stat2Label: "Products created",
        stat3Value: `${finalOrders.toLocaleString("id-ID")}+`,
        stat3Label: "Completed orders",
      };

      return { data: formattedData };
    } catch (error) {
      console.error("Gagal menghitung statistik Who We Are:", error);

      // Fallback: Jika terjadi error di database, kembalikan nilai dummy agar web tidak error
      return {
        data: {
          stat1Value: `${DUMMY_CUSTOMERS.toLocaleString("id-ID")}+`,
          stat1Label: "Happy customers",
          stat2Value: `${DUMMY_PRODUCTS.toLocaleString("id-ID")}+`,
          stat2Label: "Products created",
          stat3Value: `${DUMMY_ORDERS.toLocaleString("id-ID")}+`,
          stat3Label: "Completed orders",
        },
      };
    }
  }

  // Fungsi helper privat untuk mengeksekusi penghapusan database & file fisik
  private async executeDeletePo(
    orderId: string,
    poRecord: { id: string; fileUrl: string | null },
  ) {
    try {
      await this.prisma.clientPurchaseOrder
        .delete({
          where: { orderId },
        })
        .catch(() => {});

      if (poRecord.fileUrl) {
        await this.cloudinary.remove(poRecord.fileUrl);
      }
    } catch (error) {
      console.error("Gagal menghapus file PO otomatis:", error);
    }
  }
}
