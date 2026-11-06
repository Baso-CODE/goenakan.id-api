import { PaymentRefundStatus, Prisma } from "@prisma/client";
import { injectable } from "tsyringe";

import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";

interface RecordCompletedRefundInput {
  invoiceId: number;

  // Total dana yang benar-benar dikembalikan.
  amount: number;

  // Bagian refund untuk produk, tidak termasuk ongkir/pajak.
  productRefundAmount: number;

  // ID unik dari penyedia pembayaran.
  providerReference: string;

  // Waktu refund dikonfirmasi selesai.
  completedAt: Date;
}

@injectable()
export class PaymentRefundService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mencatat refund yang SUDAH dikonfirmasi COMPLETED.
   *
   * Tidak membuat event GA4 secara langsung.
   * GA4 ditangani oleh GA4RefundReconciliationService.
   *
   * Jangan panggil method ini hanya karena
   * status order berubah menjadi CANCELLED.
   */
  async recordCompletedRefund(input: RecordCompletedRefundInput) {
    const {
      invoiceId,
      amount,
      productRefundAmount,
      providerReference,
      completedAt,
    } = input;

    // =====================================
    // 1. VALIDASI INPUT
    // =====================================

    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) {
      throw new ApiError("Invoice ID tidak valid", 400);
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError("Jumlah refund tidak valid", 400);
    }

    if (
      !Number.isFinite(productRefundAmount) ||
      productRefundAmount < 0 ||
      productRefundAmount > amount
    ) {
      throw new ApiError("Nominal refund produk tidak valid", 400);
    }

    if (
      typeof providerReference !== "string" ||
      !providerReference.trim() ||
      providerReference.trim().length > 191
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

    const refundAmount = new Prisma.Decimal(amount);
    const productAmount = new Prisma.Decimal(productRefundAmount);

    // =====================================
    // 2. TRANSAKSI DATABASE
    // =====================================

    return this.prisma.$transaction(
      async (tx) => {
        // =====================================
        // 3. IDEMPOTENCY CHECK
        // =====================================

        const existing = await tx.paymentRefund.findUnique({
          where: {
            providerReference: reference,
          },
        });

        if (existing) {
          const sameTransaction =
            existing.invoiceId === invoiceId &&
            existing.amount.equals(refundAmount) &&
            existing.productRefundAmount !== null &&
            existing.productRefundAmount.equals(productAmount);

          if (!sameTransaction) {
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
        // 4. AMBIL INVOICE
        // =====================================

        const invoice = await tx.invoice.findUnique({
          where: {
            id: invoiceId,
          },
          include: {
            order: {
              include: {
                purchaseChannel: {
                  select: {
                    slug: true,
                  },
                },
                webOrder: {
                  select: {
                    id: true,
                    subtotal: true,
                    currencyCode: true,
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

        const order = invoice.order;

        if (
          !order ||
          order.purchaseChannel?.slug !== "website" ||
          !order.webOrder
        ) {
          throw new ApiError(
            "Service ini hanya memproses refund transaksi website",
            400,
          );
        }

        // =====================================
        // 5. VALIDASI REFUND PER INVOICE
        // =====================================

        const invoiceRefunds = await tx.paymentRefund.findMany({
          where: {
            invoiceId,
            status: PaymentRefundStatus.COMPLETED,
          },
          select: {
            amount: true,
          },
        });

        const totalInvoiceRefunded = invoiceRefunds.reduce(
          (total, refund) => total.plus(refund.amount),
          new Prisma.Decimal(0),
        );

        if (
          totalInvoiceRefunded
            .plus(refundAmount)
            .greaterThan(invoice.totalAmount)
        ) {
          throw new ApiError("Total refund melebihi nilai invoice", 400);
        }

        // =====================================
        // 6. VALIDASI REFUND PRODUK PER ORDER
        // =====================================

        const orderRefunds = await tx.paymentRefund.findMany({
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

        const hasUnknownAllocation = orderRefunds.some(
          (refund) => refund.productRefundAmount === null,
        );

        if (hasUnknownAllocation) {
          throw new ApiError(
            "Terdapat refund lama tanpa alokasi produk. " +
              "Lakukan rekonsiliasi data terlebih dahulu.",
            409,
          );
        }

        const alreadyRefundedProducts = orderRefunds.reduce(
          (total, refund) => total.plus(refund.productRefundAmount ?? 0),
          new Prisma.Decimal(0),
        );

        const orderProductSubtotal = new Prisma.Decimal(
          order.webOrder.subtotal,
        );

        if (
          alreadyRefundedProducts
            .plus(productAmount)
            .greaterThan(orderProductSubtotal)
        ) {
          throw new ApiError(
            "Total refund produk melebihi subtotal website order",
            400,
          );
        }

        // =====================================
        // 7. SIMPAN REFUND COMPLETED
        // =====================================

        const refund = await tx.paymentRefund.create({
          data: {
            invoiceId,
            amount: refundAmount,
            productRefundAmount: productAmount,
            status: PaymentRefundStatus.COMPLETED,
            providerReference: reference,
            completedAt,
          },
        });

        // =====================================
        // 8. SELESAI
        // =====================================

        // Tidak membuat GA4 Tracking Outbox di sini.
        // Proses tersebut dilakukan oleh
        // GA4RefundReconciliationService.

        return refund;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 20000,
      },
    );
  }
}
