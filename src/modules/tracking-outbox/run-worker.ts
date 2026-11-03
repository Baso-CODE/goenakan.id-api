import "dotenv/config";
import "reflect-metadata";

import { container } from "tsyringe";

import { PrismaService } from "../prisma/prisma.service";
import { TrackingOutboxWorker } from "./tracking-outbox.worker";

const prisma = container.resolve(PrismaService);
const worker = container.resolve(TrackingOutboxWorker);

const intervalMs = 15_000;

let running = false;
let stopping = false;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function main() {
  console.log("[TRACKING] Worker started");

  while (!stopping) {
    if (!running) {
      running = true;

      try {
        await worker.runOnce(20);
      } catch (error) {
        console.error("[TRACKING] Worker cycle failed:", error);
      } finally {
        running = false;
      }
    }

    await sleep(intervalMs);
  }

  await prisma.$disconnect();
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
