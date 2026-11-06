import "dotenv/config";

// ==========================================
// GA4 REFUND DEBUG TEST
// Tidak membaca atau mengubah database.
// Tidak melakukan refund pembayaran.
// ==========================================

type GA4ValidationMessage = {
  fieldPath?: string;
  description?: string;
  validationCode?: string;
};

async function main() {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;

  if (!measurementId || !apiSecret) {
    throw new Error("Konfigurasi GA4 belum lengkap");
  }

  const transactionId = "TEST-GI-SO-DEBUG-001";

  // Simulasi:
  // Purchase produk = Rp180.000
  // Refund produk = Rp90.000
  const productRefundAmount = 90_000;

  const payload = {
    client_id: "1234567890.1234567890",

    timestamp_micros: Date.now() * 1000,

    events: [
      {
        name: "refund",
        params: {
          transaction_id: transactionId,
          currency: "IDR",
          value: productRefundAmount,
        },
      },
    ],
  };

  console.log("\n=== REFUND DEBUG PAYLOAD ===");
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
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`GA4 Debug HTTP ${response.status}`);
  }

  const result = (await response.json()) as {
    validationMessages?: GA4ValidationMessage[];
  };

  console.log("\n=== GA4 REFUND DEBUG RESULT ===");
  console.log(JSON.stringify(result, null, 2));

  const messages = result.validationMessages ?? [];

  if (messages.length > 0) {
    console.error("\n❌ GA4 Refund memiliki masalah validasi");
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ GA4 Refund lolos validasi debug");
  console.log("✅ Tidak ada perubahan database");
  console.log("✅ Tidak ada transaksi refund sungguhan");
}

main().catch((error) => {
  console.error(
    "[GA4 REFUND TEST FAILED]",
    error instanceof Error ? error.message : error,
  );

  process.exitCode = 1;
});
