import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";

import { PrismaService } from "../prisma/prisma.service";

type TrackingDestination = "GA4" | "META";

type TrackingEventName =
  | "purchase"
  | "refund"
  | "qualify_lead"
  | "close_convert_lead";

export interface EnqueueTrackingEventInput {
  eventKey: string;
  eventName: TrackingEventName;
  destination: TrackingDestination;
  payload: Prisma.InputJsonValue;
}

@injectable()
export class TrackingOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Simpan event tracking tanpa duplikasi.
   *
   * Bisa digunakan dalam transaksi Prisma yang sudah aktif
   * agar pencatatan event bersifat atomic dengan perubahan bisnis.
   */
  async enqueue(
    input: EnqueueTrackingEventInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;

    try {
      return await db.trackingOutbox.create({
        data: {
          eventKey: input.eventKey,
          eventName: input.eventName,
          destination: input.destination,
          payload: input.payload,

          status: "PENDING",
          retryCount: 0,
          maxRetries: 5,
          nextRetryAt: new Date(),
        },
      });
    } catch (error) {
      // Event key sudah pernah tercatat.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // Di dalam transaksi, jangan menelan error unique
        // karena pada beberapa database transaksi bisa invalid.
        if (tx) {
          throw error;
        }

        return db.trackingOutbox.findUnique({
          where: {
            eventKey: input.eventKey,
          },
        });
      }

      throw error;
    }
  }

  /**
   * Ambil event berdasarkan unique key.
   */
  async findByEventKey(eventKey: string) {
    return this.prisma.trackingOutbox.findUnique({
      where: {
        eventKey,
      },
    });
  }

  /**
   * Ambil event yang siap diproses worker.
   */
  async findPending(limit = 20) {
    const now = new Date();

    return this.prisma.trackingOutbox.findMany({
      where: {
        status: "PENDING",
        OR: [
          {
            nextRetryAt: null,
          },
          {
            nextRetryAt: {
              lte: now,
            },
          },
        ],
      },
      orderBy: {
        createdAt: "asc",
      },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /**
   * Tandai event berhasil dikirim.
   */
  async markAsSent(id: string) {
    return this.prisma.trackingOutbox.update({
      where: { id },
      data: {
        status: "SENT",
        processedAt: new Date(),
        lastError: null,
        nextRetryAt: null,
      },
    });
  }

  /**
   * Tandai gagal dan jadwalkan retry.
   */
  async markAsFailed(id: string, errorMessage: string) {
    const event = await this.prisma.trackingOutbox.findUnique({
      where: { id },
      select: {
        retryCount: true,
        maxRetries: true,
      },
    });

    if (!event) {
      throw new Error("Tracking event tidak ditemukan");
    }

    const retryCount = event.retryCount + 1;

    const exhausted = retryCount >= event.maxRetries;

    const retryDelayMinutes = Math.min(2 ** retryCount, 60);

    const nextRetryAt = exhausted
      ? null
      : new Date(Date.now() + retryDelayMinutes * 60_000);

    return this.prisma.trackingOutbox.update({
      where: { id },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        retryCount,
        nextRetryAt,
        lastError: errorMessage.slice(0, 2000),
      },
    });
  }
}
