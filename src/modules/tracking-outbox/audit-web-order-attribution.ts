import "dotenv/config";
import "reflect-metadata";

import { PrismaService } from "../prisma/prisma.service";

const prisma = new PrismaService();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main() {
  try {
    const orders = await prisma.webOrder.findMany({
      select: {
        status: true,
        attribution: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    const summary = {
      totalSampled: orders.length,
      paid: 0,
      withAttribution: 0,
      withValidGAClientId: 0,
      withoutValidGAClientId: 0,
    };

    for (const order of orders) {
      if (order.status === "PAID" || order.status === "PROCESSING") {
        summary.paid++;
      }

      const attribution = isRecord(order.attribution)
        ? order.attribution
        : null;

      if (attribution) {
        summary.withAttribution++;
      }

      const clientId = attribution?.ga_client_id;

      if (typeof clientId === "string" && /^\d+\.\d+$/.test(clientId)) {
        summary.withValidGAClientId++;
      } else {
        summary.withoutValidGAClientId++;
      }
    }

    console.log("\n=== WEB ORDER ATTRIBUTION AUDIT ===");
    console.table(summary);
    console.log("===================================\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Attribution audit failed:", error);
  process.exitCode = 1;
});
