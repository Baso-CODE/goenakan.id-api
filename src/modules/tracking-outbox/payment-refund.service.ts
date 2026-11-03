import { PaymentRefundStatus, Prisma } from "@prisma/client";
import { injectable } from "tsyringe";

import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";

interface RecordCompletedRefundInput {
  invoiceId: number;
  amount: number;
  providerReference: string;
  completedAt: Date;
}

type PurchasePayload = {
  client_id?: string;
  events?: Array<{
    name: string;
    params?: Record<string, unknown>;
  }>;
};

@injectable()
export class PaymentRefundService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catat refund yang SUDAH dikonfirmasi selesai
   * oleh penyedia pembayaran.
   *
   * Jangan panggil method ini hanya karena
   * status order berubah menjadi CANCELLED.
   */
  async recordCompletedRefund(input: RecordCompletedRefundInput) {
    const { invoiceId, amount, providerReference, completedAt } = input;

    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) {
      throw new ApiError("Invoice ID tidak valid", 400);
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError("Jumlah refund tidak valid", 400);
    }

    if (
      !providerReference ||
      !providerReference.trim() ||
      providerReference.length > 191
    ) {
      throw new ApiError("Referensi refund tidak valid", 400);
    }

    if (
      !(completedAt instanceof Date) ||
      Number.isNaN(completedAt.getTime()) ||
      completedAt.getTime() > Date.now()
    ) {
      throw new ApiError("Tanggal refund tidak valid", 400);
    }

    const reference = providerReference.trim();

    return this.prisma.$transaction(
      async (tx) => {
        // =====================================
        // 1. IDEMPOTENCY CHECK
        // =====================================
        const existing = await tx.paymentRefund.findUnique({
          where: {
            providerReference: reference,
          },
        });

        if (existing) {
          if (
            existing.invoiceId !== invoiceId ||
            !existing.amount.equals(amount)
          ) {
            throw new ApiError(
              "Referensi refund sudah digunakan untuk transaksi berbeda",
              409,
            );
          }

          if (existing.status !== PaymentRefundStatus.COMPLETED) {
            throw new ApiError(
              "Referensi refund belum berstatus COMPLETED",
              409,
            );
          }

          return existing;
        }

        // =====================================
        // 2. AMBIL INVOICE DAN ORDER
        // =====================================
        const invoice = await tx.invoice.findUnique({
          where: { id: invoiceId },
          include: {
            order: {
              include: {
                purchaseChannel: {
                  select: { slug: true },
                },
                webOrder: {
                  select: {
                    id: true,
                    attribution: true,
                  },
                },
              },
            },
          },
        });

        if (!invoice) {
          throw new ApiError("Invoice tidak ditemukan", 404);
        }

        if (invoice.status !== "PAID") {
          throw new ApiError(
            "Refund hanya dapat dicatat untuk invoice PAID",
            400,
          );
        }

        if (
          !invoice.order ||
          invoice.order.purchaseChannel?.slug !== "website" ||
          !invoice.order.webOrder
        ) {
          throw new ApiError(
            "Service ini hanya memproses refund transaksi website",
            400,
          );
        }

        // =====================================
        // 3. VALIDASI JUMLAH REFUND
        // =====================================
        const previousRefunds = await tx.paymentRefund.findMany({
          where: {
            invoiceId,
            status: PaymentRefundStatus.COMPLETED,
          },
          select: {
            amount: true,
          },
        });

        const alreadyRefunded = previousRefunds.reduce(
          (total, refund) => total.plus(refund.amount),
          new Prisma.Decimal(0),
        );

        const refundAmount = new Prisma.Decimal(amount);

        if (
          alreadyRefunded.plus(refundAmount).greaterThan(invoice.totalAmount)
        ) {
          throw new ApiError("Total refund melebihi nilai invoice", 400);
        }

        // =====================================
        // 4. SIMPAN REFUND COMPLETED
        // =====================================
        const refund = await tx.paymentRefund.create({
          data: {
            invoiceId,
            amount: refundAmount,
            status: PaymentRefundStatus.COMPLETED,
            providerReference: reference,
            completedAt,
          },
        });

        // =====================================
        // 5. AMBIL PURCHASE ASLI
        // =====================================
        const originalPurchase = await tx.trackingOutbox.findUnique({
          where: {
            eventKey: `ga4:purchase:invoice:${invoiceId}`,
          },
          select: {
            payload: true,
            destination: true,
            eventName: true,
          },
        });

        if (
          !originalPurchase ||
          originalPurchase.destination !== "GA4" ||
          originalPurchase.eventName !== "purchase"
        ) {
          // Refund tetap tercatat.
          // Jangan membuat data GA4 tanpa purchase asli.
          return refund;
        }

        const purchasePayload = originalPurchase.payload as PurchasePayload;

        const clientId = purchasePayload.client_id;

        const purchaseEvent = purchasePayload.events?.find(
          (event) => event.name === "purchase",
        );

        const transactionId = purchaseEvent?.params?.transaction_id;

        if (
          typeof clientId !== "string" ||
          !/^\d+\.\d+$/.test(clientId) ||
          typeof transactionId !== "string" ||
          !transactionId.trim()
        ) {
          return refund;
        }

        // =====================================
        // 6. BUAT GA4 REFUND PAYLOAD
        // =====================================
        const refundPayload = {
          client_id: clientId,
          timestamp_micros: completedAt.getTime() * 1000,
          events: [
            {
              name: "refund",
              params: {
                transaction_id: transactionId,
                currency: invoice.order.currencyCode || "IDR",
                value: refundAmount.toNumber(),
              },
            },
          ],
        };

        // =====================================
        // 7. SIMPAN OUTBOX SECARA ATOMIK
        // =====================================
        await tx.trackingOutbox.createMany({
          data: [
            {
              eventKey: `ga4:refund:${refund.id}`,
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

        return refund;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 20000,
      },
    );
  }
}
