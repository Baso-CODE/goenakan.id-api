import type { Prisma } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

interface PurchaseIdentity {
  orderId: string;
  orderNumber: string;
}

/**
 * Memeriksa apakah GA4 purchase untuk sebuah website order
 * sudah pernah dibuat, baik dengan key v1.7 maupun key lama.
 *
 * Harus dipanggil di dalam transaksi pembayaran.
 */
export async function hasExistingGA4Purchase(
  tx: TransactionClient,
  { orderId, orderNumber }: PurchaseIdentity,
): Promise<boolean> {
  const invoices = await tx.invoice.findMany({
    where: {
      orderId,
    },
    select: {
      id: true,
    },
  });

  const legacyKeys = invoices.map(
    (invoice) => `ga4:purchase:invoice:${invoice.id}`,
  );

  const existing = await tx.trackingOutbox.findFirst({
    where: {
      destination: "GA4",
      eventName: "purchase",
      eventKey: {
        in: [`${orderNumber}:purchase`, ...legacyKeys],
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(existing);
}
