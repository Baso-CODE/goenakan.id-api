import "dotenv/config";

import { buildGA4Purchase } from "./ga4-purchase.helper";

async function main() {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;

  if (!measurementId || !apiSecret) {
    throw new Error("Konfigurasi GA4 belum lengkap");
  }

  const payload = buildGA4Purchase({
    invoiceId: 999999,
    orderNumber: "GI-SO-DEBUG-001",
    amount: 180000,
    currency: "IDR",

    attribution: {
      ga_client_id: "1234567890.1234567890",
      ga_session_id: "1234567890",
    },

    paidAt: new Date(),
    isTestTransaction: true,

    items: [
      {
        productId: "TEST-PRODUCT-001",
        variantId: null,
        productName: "Custom Tumbler",
        quantity: 2,
        price: 90000,

        customization: {
          zones: {
            front: {
              logoCount: 1,
              logos: [
                {
                  printingMethod: "DTF",
                },
              ],
            },
            back: {
              logoCount: 1,
              logos: [
                {
                  printingMethod: "Sablon",
                },
              ],
            },
          },
        },
      },
    ],
  });

  if (!payload) {
    throw new Error("GA4 Purchase Payload gagal dibuat");
  }

  console.log("\n=== PURCHASE PAYLOAD ===");

  console.log(JSON.stringify(payload, null, 2));

  const url = new URL("https://www.google-analytics.com/debug/mp/collect");

  url.searchParams.set("measurement_id", measurementId);
  url.searchParams.set("api_secret", apiSecret);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      validation_behavior: "ENFORCE_RECOMMENDATIONS",
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`GA4 Debug HTTP ${response.status}`);
  }

  const result = await response.json();

  console.log("\n=== GA4 DEBUG RESULT ===");

  console.log(JSON.stringify(result, null, 2));

  const validationMessages =
    (
      result as {
        validationMessages?: unknown[];
      }
    ).validationMessages ?? [];

  if (validationMessages.length > 0) {
    console.error("\n❌ GA4 Purchase memiliki masalah validasi");

    process.exitCode = 1;
  } else {
    console.log("\n✅ GA4 Purchase lolos validasi debug");
  }
}

main().catch((error) => {
  console.error("[GA4 TEST FAILED]", error);

  process.exitCode = 1;
});
