import "dotenv/config";
import "reflect-metadata";

import { container } from "tsyringe";

import { PrismaService } from "../prisma/prisma.service";
import { GA4RefundReconciliationService } from "./ga4-refund-reconciliation.service";
import { TrackingOutboxWorker } from "./tracking-outbox.worker";

const prisma = container.resolve(PrismaService);
const worker = container.resolve(TrackingOutboxWorker);
const refundReconciliation = container.resolve(GA4RefundReconciliationService);

// GA4 outbox diproses setiap 15 detik.
const workerIntervalMs = 15_000;

// Refund reconciliation dijalankan setiap 5 menit.
const reconciliationIntervalMs = 5 * 60_000;

let stopping = false;
let lastReconciliationAt = 0;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function runCycle() {
  // ==========================================
  // 1. PROCESS GA4 OUTBOX
  // ==========================================

  try {
    await worker.runOnce(20);
  } catch (error) {
    console.error("[TRACKING] Worker cycle failed:", error);
  }

  // ==========================================
  // 2. REFUND RECONCILIATION
  // ==========================================

  const now = Date.now();

  if (now - lastReconciliationAt < reconciliationIntervalMs) {
    return;
  }

  // Perbarui sebelum eksekusi agar exception
  // tidak menyebabkan retry ketat setiap siklus.
  lastReconciliationAt = now;

  try {
    const summary = await refundReconciliation.reconcilePendingRefunds(50);

    if (
      summary.created > 0 ||
      summary.errors > 0 ||
      summary.reviewRequired > 0
    ) {
      console.log("[GA4 REFUND RECONCILIATION]", summary);
    }

    // ==========================================
    // 3. PROCESS NEW REFUND OUTBOX
    // ==========================================

    if (summary.created > 0) {
      await worker.runOnce(20);
    }
  } catch (error) {
    console.error("[GA4 REFUND RECONCILIATION] Failed:", error);
  }
}

async function main() {
  console.log("[TRACKING] Worker started");

  while (!stopping) {
    // Menunggu satu siklus selesai sebelum
    // menjalankan siklus berikutnya.
    await runCycle();

    if (!stopping) {
      await sleep(workerIntervalMs);
    }
  }

  await prisma.$disconnect();

  console.log("[TRACKING] Worker stopped");
}

process.on("SIGINT", () => {
  stopping = true;
});

process.on("SIGTERM", () => {
  stopping = true;
});

main().catch(async (error) => {
  console.error("[TRACKING] Fatal error:", error);

  await prisma.$disconnect();

  process.exitCode = 1;
});
