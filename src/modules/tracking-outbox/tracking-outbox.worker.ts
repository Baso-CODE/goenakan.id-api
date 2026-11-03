import { randomUUID } from "node:crypto";
import { injectable } from "tsyringe";

import { PrismaService } from "../prisma/prisma.service";
import {
  GA4EventPayload,
  GA4MeasurementService,
  TrackingPermanentError,
} from "./ga4-measurement.service";

@injectable()
export class TrackingOutboxWorker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ga4: GA4MeasurementService,
  ) {}

  private readonly leaseMs = 120_000;

  private async processEvent(id: string): Promise<void> {
    const now = new Date();
    const lockToken = randomUUID();

    // Klaim atomik: hanya satu worker yang menang.
    const claim = await this.prisma.trackingOutbox.updateMany({
      where: {
        id,
        OR: [
          {
            status: "PENDING",
            nextRetryAt: { lte: now },
          },
          {
            status: "PENDING",
            nextRetryAt: null,
          },
          {
            status: "PROCESSING",
            nextRetryAt: { lte: now },
          },
        ],
      },
      data: {
        status: "PROCESSING",
        lockToken,
        nextRetryAt: new Date(Date.now() + this.leaseMs),
      },
    });

    if (claim.count !== 1) return;

    const event = await this.prisma.trackingOutbox.findUnique({
      where: { id },
    });

    if (!event || event.lockToken !== lockToken) {
      return;
    }

    try {
      if (event.destination !== "GA4") {
        throw new TrackingPermanentError(
          `Destination ${event.destination} belum didukung`,
        );
      }

      const payload = event.payload as unknown as GA4EventPayload;

      await this.ga4.send(payload);

      await this.prisma.trackingOutbox.updateMany({
        where: {
          id,
          status: "PROCESSING",
          lockToken,
        },
        data: {
          status: "SENT",
          lockToken: null,
          nextRetryAt: null,
          lastError: null,
          processedAt: new Date(),
        },
      });

      console.log(`[TRACKING] SENT ${event.eventKey}`);
    } catch (error) {
      const permanent = error instanceof TrackingPermanentError;

      const retryCount = event.retryCount + 1;

      const exhausted = permanent || retryCount >= event.maxRetries;

      const delayMinutes = Math.min(2 ** retryCount, 60);

      const errorMessage =
        error instanceof Error ? error.message : "Unknown tracking error";

      await this.prisma.trackingOutbox.updateMany({
        where: {
          id,
          status: "PROCESSING",
          lockToken,
        },
        data: {
          status: exhausted ? "FAILED" : "PENDING",
          retryCount,
          lockToken: null,
          nextRetryAt: exhausted
            ? null
            : new Date(Date.now() + delayMinutes * 60_000),
          lastError: errorMessage.slice(0, 2000),
        },
      });

      console.error(`[TRACKING] ${event.eventKey}: ${errorMessage}`);
    }
  }

  async runOnce(limit = 20): Promise<number> {
    const now = new Date();

    const events = await this.prisma.trackingOutbox.findMany({
      where: {
        OR: [
          {
            status: "PENDING",
            nextRetryAt: null,
          },
          {
            status: "PENDING",
            nextRetryAt: { lte: now },
          },
          {
            status: "PROCESSING",
            nextRetryAt: { lte: now },
          },
        ],
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: Math.min(Math.max(limit, 1), 100),
    });

    for (const event of events) {
      await this.processEvent(event.id);
    }

    return events.length;
  }
}
