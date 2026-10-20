import {
  InvoiceBillingMode,
  InvoiceCategory,
  InvoiceStatus,
  PaymentMethod,
  Prisma,
  TransactionType,
} from "@prisma/client";
import { injectable } from "tsyringe";

type PaymentRecordInput = {
  orderId: string;
  clientId: string;
  orderNumber: string;
  amount: Prisma.Decimal;
  currencyCode: string;
  paymentType: string;
  paidAt: Date;
};

@injectable()
export class WebOrderPaymentRecordService {
  private readonly financeCategorySlug = "penjualan-website";

  private mapPaymentMethod(value: string): PaymentMethod | null {
    const method = value.toLowerCase();

    if (method === "credit_card") return PaymentMethod.CREDIT_CARD;
    if (method === "qris") return PaymentMethod.QRIS;

    if (
      ["bank_transfer", "echannel", "permata", "bca_klikpay"].includes(method)
    ) {
      return PaymentMethod.BANK_TRANSFER;
    }

    return null;
  }

  async record(tx: Prisma.TransactionClient, input: PaymentRecordInput) {
    const systemUserId = process.env.WEB_ORDER_SYSTEM_USER_ID;

    if (!systemUserId) {
      throw new Error("WEB_ORDER_SYSTEM_USER_ID belum dikonfigurasi");
    }

    const [user, category, order] = await Promise.all([
      tx.user.findUnique({
        where: { id: systemUserId },
        select: { id: true },
      }),
      tx.financeCategory.findUnique({
        where: { slug: this.financeCategorySlug },
        select: { id: true, type: true, isActive: true },
      }),
      tx.order.findUnique({
        where: { id: input.orderId },
        include: {
          products: true,
          client: { select: { custCode: true } },
          invoices: { select: { id: true } },
        },
      }),
    ]);

    if (!user) throw new Error("User sistem tidak ditemukan");

    if (
      !category ||
      !category.isActive ||
      category.type !== TransactionType.INCOME
    ) {
      throw new Error("Kategori Penjualan Website belum valid");
    }

    if (!order || !order.products.length) {
      throw new Error("Order Sales atau produk tidak ditemukan");
    }

    if (order.invoices.length > 0) {
      throw new Error("Order Sales sudah memiliki invoice");
    }

    const orderTotal = new Prisma.Decimal(order.totalAmount);

    if (!orderTotal.equals(input.amount)) {
      throw new Error("Nominal Order Sales dan pembayaran tidak cocok");
    }

    const method = this.mapPaymentMethod(input.paymentType);

    const invoice = await tx.invoice.create({
      data: {
        orderId: order.id,
        clientId: input.clientId,
        userId: user.id,
        totalAmount: orderTotal,
        category: InvoiceCategory.FULL_PAYMENT,
        billingMode: InvoiceBillingMode.STANDARD,
        status: InvoiceStatus.PAID,
        method,
        paidAt: input.paidAt,
        paymentDate: input.paidAt,
        items: {
          create: order.products.map((item) => ({
            orderProductId: item.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            price: item.unitPrice,
            remarks: item.remarks,
            customization: item.customization
              ? (item.customization as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          })),
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
      order.client.custCode || "NOC",
      romanMonths[input.paidAt.getMonth()],
      input.paidAt.getFullYear(),
    ].join("_");

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { invoiceNumber },
    });

    const finance = await tx.financeTransaction.create({
      data: {
        transactionDate: input.paidAt,
        type: TransactionType.INCOME,
        amount: orderTotal,
        referenceNumber: `MIDTRANS:${input.orderNumber}`,
        description:
          `Pembayaran website ${input.orderNumber} - ` +
          `${invoiceNumber} (${input.paymentType})`,
        method,
        currencyCode: input.currencyCode,
        createdBy: user.id,
        categoryId: category.id,
      },
    });

    return {
      invoiceId: invoice.id,
      invoiceNumber,
      financeTransactionId: finance.id,
    };
  }
}
