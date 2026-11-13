import { Prisma } from "@prisma/client";

import { getGA4CustomizationFields } from "./ga4-customization.helper";

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
  customization?: Prisma.JsonValue | null;
};

type PurchaseInput = {
  invoiceId: number;
  orderNumber: string;
  amount: Prisma.Decimal | string | number;
  currency: string;
  attribution: Prisma.JsonValue | null;
  items: PurchaseItem[];
  paidAt: Date;
  isTestTransaction: boolean;
};

export function buildGA4Purchase(input: PurchaseInput) {
  const attribution =
    input.attribution &&
    typeof input.attribution === "object" &&
    !Array.isArray(input.attribution)
      ? (input.attribution as GA4Attribution)
      : null;

  const clientId = attribution?.ga_client_id;

  // Tidak boleh membuat GA client ID palsu.
  if (typeof clientId !== "string" || !/^\d+\.\d+$/.test(clientId)) {
    return null;
  }

  // ==========================================
  // BUILD PURCHASE ITEMS
  // ==========================================

  const items = input.items.map((item) => {
    const customizationFields = getGA4CustomizationFields(item.customization);

    return {
      item_id: item.variantId || item.productId,
      item_name: item.productName,
      quantity: item.quantity,
      price: Number(item.price),

      ...customizationFields,
    };
  });

  // ==========================================
  // VALIDATE ITEMS
  // ==========================================

  if (
    !items.length ||
    items.some(
      (item) =>
        !item.item_id ||
        !Number.isFinite(item.price) ||
        item.price < 0 ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0,
    )
  ) {
    return null;
  }

  const value = Number(input.amount);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  // ==========================================
  // BUILD GA4 PURCHASE PARAMS
  // ==========================================

  const params: Record<string, unknown> = {
    transaction_id: input.isTestTransaction
      ? `TEST-${input.orderNumber}`
      : input.orderNumber,

    currency: input.currency,
    value,
    items,

    engagement_time_msec: 1,
    purchase_channel: "website",
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
