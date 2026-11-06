import { PaymentRefundStatus, Prisma } from "@prisma/client";
import { injectable } from "tsyringe";

import { PrismaService } from "../prisma/prisma.service";

type ReconciliationResult =
  | "CREATED"
  | "EXISTS"
  | "DEFERRED"
  | "SKIPPED"
  | "REVIEW_REQUIRED";

type PurchasePayload = {
  client_id?: string;
  events?: Array<{
    name: string;
    params?: Record<string, unknown>;
  }>;
};

@injectable()
export class GA4RefundReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rekonsiliasi satu refund.
   *
   * Tidak mengubah status refund bisnis.
   * Hanya membuat GA4 Tracking Outbox jika valid.
   */
  async reconcileRefund(refundId: string): Promise<ReconciliationResult> {
    return this.prisma.$transaction(
      async (tx) => {
        // ======================================
        // 1. AMBIL REFUND
        // ======================================

        const refund = await tx.paymentRefund.findUnique({
          where: {
            id: refundId,
          },
          include: {
            invoice: {
              include: {
                order: {
                  include: {
                    purchaseChannel: {
                      select: {
                        slug: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!refund) return "SKIPPED";

        if (refund.status !== PaymentRefundStatus.COMPLETED) {
          return "SKIPPED";
        }

        if (!refund.completedAt) {
          return "SKIPPED";
        }

        const order = refund.invoice.order;

        if (
          !order ||
          order.purchaseChannel?.slug !== "website" ||
          !order.webOrderId
        ) {
          return "SKIPPED";
        }

        // ======================================
        // 2. PERIKSA OUTBOX REFUND
        // ======================================

        const refundEventKey = `ga4:refund:${refund.id}`;

        const existingOutbox = await tx.trackingOutbox.findUnique({
          where: {
            eventKey: refundEventKey,
          },
          select: {
            id: true,
          },
        });

        if (existingOutbox) {
          return "EXISTS";
        }

        // ======================================
        // 3. VALIDASI ALOKASI REFUND
        // ======================================

        if (refund.productRefundAmount === null) {
          console.warn(
            `[GA4 REFUND] ${refund.id}: ` +
              "Alokasi refund produk tidak tersedia.",
          );

          return "REVIEW_REQUIRED";
        }

        const productAmount = new Prisma.Decimal(refund.productRefundAmount);

        if (
          productAmount.isNegative() ||
          productAmount.greaterThan(refund.amount)
        ) {
          return "REVIEW_REQUIRED";
        }

        // Refund ongkir saja:
        // tidak ada nilai produk yang perlu
        // dikurangkan dari GA4 revenue.
        if (productAmount.isZero()) {
          return "SKIPPED";
        }

        // ======================================
        // 4. CARI PURCHASE KEY BARU + LEGACY
        // ======================================

        const invoices = await tx.invoice.findMany({
          where: {
            orderId: order.id,
          },
          select: {
            id: true,
          },
        });

        const purchaseKeys = [
          ...(order.orderNumber?.trim()
            ? [`${order.orderNumber.trim()}:purchase`]
            : []),

          ...invoices.map((invoice) => `ga4:purchase:invoice:${invoice.id}`),
        ];

        const purchases = await tx.trackingOutbox.findMany({
          where: {
            destination: "GA4",
            eventName: "purchase",
            eventKey: {
              in: purchaseKeys,
            },
          },
          select: {
            id: true,
            status: true,
            payload: true,
          },
        });

        const sentPurchases = purchases.filter(
          (purchase) => purchase.status === "SENT",
        );

        if (sentPurchases.length > 1) {
          console.error(
            `[GA4 REFUND] ${refund.id}: ` + "Ditemukan beberapa purchase SENT.",
          );

          return "REVIEW_REQUIRED";
        }

        if (sentPurchases.length === 0) {
          return "DEFERRED";
        }

        // ======================================
        // 5. BACA PURCHASE ASLI
        // ======================================

        const purchasePayload = sentPurchases[0].payload as PurchasePayload;

        const clientId = purchasePayload.client_id;

        const purchaseEvent = purchasePayload.events?.find(
          (event) => event.name === "purchase",
        );

        const transactionId = purchaseEvent?.params?.transaction_id;

        const purchaseCurrency = purchaseEvent?.params?.currency;

        const purchaseValue = purchaseEvent?.params?.value;

        if (
          typeof clientId !== "string" ||
          !/^\d+\.\d+$/.test(clientId) ||
          typeof transactionId !== "string" ||
          !transactionId.trim() ||
          purchaseCurrency !== "IDR" ||
          typeof purchaseValue !== "number" ||
          !Number.isFinite(purchaseValue) ||
          purchaseValue < 0
        ) {
          return "REVIEW_REQUIRED";
        }

        // ======================================
        // 6. PERIKSA TOTAL REFUND PRODUK
        // ======================================

        const allRefunds = await tx.paymentRefund.findMany({
          where: {
            invoice: {
              orderId: order.id,
            },
            status: PaymentRefundStatus.COMPLETED,
          },
          select: {
            productRefundAmount: true,
          },
        });

        // Jangan menebak nilai dari refund lama
        // yang belum memiliki alokasi.
        if (allRefunds.some((item) => item.productRefundAmount === null)) {
          return "REVIEW_REQUIRED";
        }

        const totalProductRefund = allRefunds.reduce(
          (total, item) => total.plus(item.productRefundAmount ?? 0),
          new Prisma.Decimal(0),
        );

        if (totalProductRefund.greaterThan(new Prisma.Decimal(purchaseValue))) {
          console.error(
            `[GA4 REFUND] ${refund.id}: ` +
              "Total refund produk melebihi GA4 purchase.",
          );

          return "REVIEW_REQUIRED";
        }

        // ======================================
        // 7. VALIDASI TIMESTAMP GA4
        // ======================================

        const completedAt = refund.completedAt;

        const ageMs = Date.now() - completedAt.getTime();

        const maxAgeMs = 72 * 60 * 60 * 1000;

        if (ageMs > maxAgeMs || ageMs < -60_000) {
          console.warn(
            `[GA4 REFUND] ${refund.id}: ` +
              "Timestamp berada di luar jendela GA4.",
          );

          return "SKIPPED";
        }

        // ======================================
        // 8. BUILD REFUND PAYLOAD
        // ======================================

        const refundPayload = {
          client_id: clientId,

          timestamp_micros: completedAt.getTime() * 1000,

          events: [
            {
              name: "refund",
              params: {
                transaction_id: transactionId,
                currency: "IDR",
                value: productAmount.toNumber(),
              },
            },
          ],
        };

        // ======================================
        // 9. INSERT IDEMPOTENT OUTBOX
        // ======================================

        const inserted = await tx.trackingOutbox.createMany({
          data: [
            {
              eventKey: refundEventKey,
              eventName: "refund",
              destination: "GA4",
              payload: refundPayload as Prisma.InputJsonValue,
              status: "PENDING",
              retryCount: 0,
              maxRetries: 5,
              nextRetryAt: new Date(),
            },
          ],
          skipDuplicates: true,
        });

        return inserted.count === 1 ? "CREATED" : "EXISTS";
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 20000,
      },
    );
  }
  /**
   * Rekonsiliasi seluruh refund COMPLETED yang masih
   * berada dalam jendela pengiriman GA4.
   *
   * Menggunakan cursor pagination agar refund lama
   * tidak menghalangi refund yang lebih baru.
   *
   * limit = ukuran batch database, bukan jumlah total refund.
   */
  async reconcilePendingRefunds(limit = 100) {
    const batchSize = Math.min(Math.max(limit, 1), 100);

    // Sisakan margin sebelum batas 72 jam.
    // Ini tidak memperpanjang timestamp asli.
    const cutoff = new Date(Date.now() - 71 * 60 * 60 * 1000);

    const summary = {
      scanned: 0,
      created: 0,
      exists: 0,
      deferred: 0,
      skipped: 0,
      reviewRequired: 0,
      errors: 0,
    };

    let cursor: string | undefined;

    while (true) {
      const refunds = await this.prisma.paymentRefund.findMany({
        where: {
          status: PaymentRefundStatus.COMPLETED,

          completedAt: {
            gte: cutoff,
          },

          productRefundAmount: {
            not: null,
          },
        },

        select: {
          id: true,
        },

        orderBy: {
          id: "asc",
        },

        take: batchSize,

        ...(cursor
          ? {
              cursor: { id: cursor },
              skip: 1,
            }
          : {}),
      });

      if (refunds.length === 0) {
        break;
      }

      for (const refund of refunds) {
        summary.scanned++;

        try {
          const result = await this.reconcileRefund(refund.id);

          switch (result) {
            case "CREATED":
              summary.created++;
              break;

            case "EXISTS":
              summary.exists++;
              break;

            case "DEFERRED":
              summary.deferred++;
              break;

            case "SKIPPED":
              summary.skipped++;
              break;

            case "REVIEW_REQUIRED":
              summary.reviewRequired++;
              break;
          }
        } catch (error) {
          summary.errors++;

          console.error(`[GA4 REFUND RECONCILIATION] ${refund.id}:`, error);
        }
      }

      cursor = refunds[refunds.length - 1].id;

      if (refunds.length < batchSize) {
        break;
      }
    }

    return summary;
  }
}
