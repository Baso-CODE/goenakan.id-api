import "dotenv/config";
import "reflect-metadata";

import { PrismaService } from "../prisma/prisma.service";

const prisma = new PrismaService();

const SUPPORTED_EVENTS = [
  "purchase",
  "refund",
  "qualify_lead",
  "close_convert_lead",
];

type ValidationMessage = {
  fieldPath?: string;
  description?: string;
  validationCode?: string;
};

async function validateEvent(eventName: string, payload: unknown) {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;

  if (!measurementId || !apiSecret) {
    throw new Error("GA4 environment variables belum lengkap");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload tidak valid");
  }

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

  const result = (await response.json()) as {
    validationMessages?: ValidationMessage[];
  };

  const messages = result.validationMessages ?? [];

  console.log(`\nEVENT: ${eventName}`);

  if (messages.length === 0) {
    console.log("✅ VALID — Tidak ditemukan kesalahan payload");
    return true;
  }

  console.log("❌ VALIDATION MESSAGES");

  console.table(
    messages.map((message) => ({
      field: message.fieldPath ?? "-",
      code: message.validationCode ?? "-",
      description: message.description ?? "-",
    })),
  );

  return false;
}

async function main() {
  try {
    console.log("\n========== GA4 VALIDATION ==========");

    let passed = 0;
    let failed = 0;

    for (const eventName of SUPPORTED_EVENTS) {
      const event = await prisma.trackingOutbox.findFirst({
        where: {
          destination: "GA4",
          eventName,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          payload: true,
        },
      });

      if (!event) {
        console.log(`\n⚪ ${eventName}: belum ada sample event`);
        continue;
      }

      try {
        const valid = await validateEvent(eventName, event.payload);

        if (valid) {
          passed++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;

        console.error(
          `❌ ${eventName}:`,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    }

    console.log("\n========== VALIDATION RESULT ==========");
    console.log(`PASSED : ${passed}`);
    console.log(`FAILED : ${failed}`);
    console.log("=======================================\n");

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("GA4 validation failed:", error);
  process.exitCode = 1;
});
