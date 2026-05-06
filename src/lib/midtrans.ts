// lib/midtrans.ts
import midtransClient from "midtrans-client";

const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
const serverKey = process.env.MIDTRANS_SERVER_KEY as string;
const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY as string;

// Inisialisasi Snap Midtrans (Untuk membuat Token Frontend)
export const snap = new midtransClient.Snap({
  isProduction: isProduction,
  serverKey: serverKey,
  clientKey: clientKey,
});

// ✨ TAMBAHAN: Inisialisasi CoreApi (Khusus untuk proses Backend & Webhook)
export const coreApi = new midtransClient.CoreApi({
  isProduction: isProduction,
  serverKey: serverKey,
  clientKey: clientKey,
});
