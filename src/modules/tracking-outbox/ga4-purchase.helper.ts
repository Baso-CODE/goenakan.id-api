import { Prisma } from "@prisma/client";

type GA4Attribution = {
  ga_client_id?: string | null;
  ga_session_id?: string | number | null;
};

type PurchaseItem = {
  productId: string;
  variantId?: string | null;
  productName: string;
  quantity: number;
  price: Prisma.Decimal | string | number;
};

type PurchaseInput = {
  invoiceId: number;
  orderNumber: string;
  amount: Prisma.Decimal | string | number;
  currency: string;
  attribution: Prisma.JsonValue | null;
  items: PurchaseItem[];
  paidAt: Date;
};

export function buildGA4Purchase(input: PurchaseInput) {
  const attribution =
    input.attribution &&
    typeof input.attribution === "object" &&
    !Array.isArray(input.attribution)
      ? (input.attribution as GA4Attribution)
      : null;

  const clientId = attribution?.ga_client_id;

  // Jangan membuat client_id palsu.
  if (typeof clientId !== "string" || !/^\d+\.\d+$/.test(clientId)) {
    return null;
  }

  const items = input.items.map((item) => ({
    item_id: item.variantId || item.productId,
    item_name: item.productName,
    quantity: item.quantity,
    price: Number(item.price),
  }));

  if (
    !items.length ||
    items.some(
      (item) =>
        !item.item_id || !Number.isFinite(item.price) || item.quantity <= 0,
    )
  ) {
    return null;
  }

  const params: Record<string, unknown> = {
    transaction_id: input.orderNumber,
    currency: input.currency,
    value: Number(input.amount),
    items,
  };

  const sessionId = attribution?.ga_session_id;

  if (
    sessionId !== null &&
    sessionId !== undefined &&
    /^\d+$/.test(String(sessionId))
  ) {
    params.session_id = Number(sessionId);
  }

  return {
    client_id: clientId,
    timestamp_micros: input.paidAt.getTime() * 1000,
    events: [
      {
        name: "purchase",
        params,
      },
    ],
  };
}
