import "dotenv/config";
import "reflect-metadata";

import { PrismaService } from "../prisma/prisma.service";

async function main() {
  const prisma = new PrismaService();

  try {
    const now = new Date();

    const [byEvent, byStatus, failed, stuck, recent] = await Promise.all([
      prisma.trackingOutbox.groupBy({
        by: ["eventName"],
        _count: { _all: true },
      }),

      prisma.trackingOutbox.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),

      prisma.trackingOutbox.findMany({
        where: { status: "FAILED" },
        select: {
          eventKey: true,
          retryCount: true,
          lastError: true,
        },
        take: 10,
        orderBy: { updatedAt: "desc" },
      }),

      prisma.trackingOutbox.count({
        where: {
          status: "PROCESSING",
          nextRetryAt: { lt: now },
        },
      }),

      prisma.trackingOutbox.findMany({
        select: {
          eventKey: true,
          eventName: true,
          status: true,
          retryCount: true,
          createdAt: true,
          processedAt: true,
        },
        take: 20,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    console.log("\n========== GA4 TRACKING AUDIT ==========");

    console.log("\nEVENT COUNTS");
    console.table(
      byEvent.map((item) => ({
        event: item.eventName,
        total: item._count._all,
      })),
    );

    console.log("\nSTATUS COUNTS");
    console.table(
      byStatus.map((item) => ({
        status: item.status,
        total: item._count._all,
      })),
    );

    console.log("\nSTUCK PROCESSING:", stuck);

    console.log("\nFAILED EVENTS");
    console.table(failed);

    console.log("\nRECENT EVENTS");
    console.table(recent);

    console.log("\n========================================");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Tracking audit failed:", error);
  process.exitCode = 1;
});
