import "dotenv/config";
import "reflect-metadata";

import { PrismaService } from "../prisma/prisma.service";

const prisma = new PrismaService();

const SUPPORTED_EVENTS = [
  "purchase",
  "refund",
  "qualify_lead",
  "close_convert_lead",
] as const;

type ValidationMessage = {
  fieldPath?: string;
  description?: string;
  validationCode?: string;
};

type GA4Payload = {
  client_id?: string;
  timestamp_micros?: number;
  events?: Array<{
    name: string;
    params: Record<string, unknown>;
  }>;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function prepareDebugPayload(payload: unknown): GA4Payload {
  if (!isRecord(payload)) {
    throw new Error("Payload bukan object");
  }

  if (!Array.isArray(payload.events)) {
    throw new Error("Events tidak valid");
  }

  // Salinan untuk validasi struktur saja.
  // Tidak mengubah data Tracking Outbox.
  return {
    ...payload,

    // Timestamp saat ini khusus debug.
    timestamp_micros: Date.now() * 1000,

    validation_behavior: "ENFORCE_RECOMMENDATIONS",
  };
}

function validatePurchaseLocally(payload: GA4Payload): string[] {
  const issues: string[] = [];

  const purchase = payload.events?.find((event) => event.name === "purchase");

  if (!purchase) {
    return issues;
  }

  const params = purchase.params;

  if (
    typeof params.transaction_id !== "string" ||
    !params.transaction_id.trim()
  ) {
    issues.push("transaction_id tidak valid");
  }

  if (params.currency !== "IDR") {
    issues.push("Purchase currency bukan IDR");
  }

  const value = params.value;

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    issues.push("Purchase value tidak valid");
  }

  if (!Array.isArray(params.items) || params.items.length === 0) {
    issues.push("Purchase items kosong");
    return issues;
  }

  let calculatedValue = 0;

  params.items.forEach((rawItem, index) => {
    if (!isRecord(rawItem)) {
      issues.push(`items[${index}] tidak valid`);
      return;
    }

    const price = rawItem.price;
    const quantity = rawItem.quantity;

    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      issues.push(`items[${index}].price tidak valid`);
    }

    if (
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      issues.push(`items[${index}].quantity tidak valid`);
    }

    if (
      typeof price === "number" &&
      Number.isFinite(price) &&
      typeof quantity === "number" &&
      Number.isSafeInteger(quantity)
    ) {
      calculatedValue += price * quantity;
    }

    if (rawItem.is_custom !== "yes" && rawItem.is_custom !== "no") {
      issues.push(`items[${index}].is_custom tidak valid`);
    }

    if (typeof rawItem.print_method !== "string") {
      issues.push(`items[${index}].print_method tidak valid`);
    }

    if (
      typeof rawItem.print_sides !== "number" ||
      !Number.isSafeInteger(rawItem.print_sides) ||
      rawItem.print_sides < 0
    ) {
      issues.push(`items[${index}].print_sides tidak valid`);
    }

    if (
      typeof rawItem.logo_count !== "number" ||
      !Number.isSafeInteger(rawItem.logo_count) ||
      rawItem.logo_count < 0
    ) {
      issues.push(`items[${index}].logo_count tidak valid`);
    }
  });

  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(calculatedValue - value) > 0.01
  ) {
    issues.push(
      `Purchase value (${value}) berbeda dari total items (${calculatedValue})`,
    );
  }

  return issues;
}

async function validateEvent(eventName: string, rawPayload: unknown) {
  const measurementId = process.env.GA4_MEASUREMENT_ID;

  const apiSecret = process.env.GA4_API_SECRET;

  if (!measurementId || !apiSecret) {
    throw new Error("GA4 environment variables belum lengkap");
  }

  const payload = prepareDebugPayload(rawPayload);

  const localIssues =
    eventName === "purchase" ? validatePurchaseLocally(payload) : [];

  console.log(`\nEVENT: ${eventName}`);

  if (localIssues.length > 0) {
    console.log("❌ LOCAL VALIDATION");

    console.table(
      localIssues.map((issue) => ({
        issue,
      })),
    );

    return false;
  }

  const url = new URL("https://www.google-analytics.com/debug/mp/collect");

  url.searchParams.set("measurement_id", measurementId);

  url.searchParams.set("api_secret", apiSecret);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`GA4 Debug HTTP ${response.status}`);
  }

  const result = (await response.json()) as {
    validationMessages?: ValidationMessage[];
  };

  const messages = result.validationMessages ?? [];

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
    let missing = 0;

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
          eventKey: true,
          payload: true,
          status: true,
        },
      });

      if (!event) {
        console.log(`\n⚪ ${eventName}: belum ada sample event`);

        missing++;
        continue;
      }

      console.log(`\nEvent Key: ${event.eventKey}`);

      console.log(`Outbox Status: ${event.status}`);

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

    console.log(`PASSED  : ${passed}`);
    console.log(`FAILED  : ${failed}`);
    console.log(`MISSING : ${missing}`);

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
