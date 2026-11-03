import { injectable } from "tsyringe";

export interface GA4EventPayload {
  client_id: string;
  user_id?: string;
  timestamp_micros?: number;
  events: Array<{
    name: string;
    params: Record<string, unknown>;
  }>;
}

export class TrackingPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackingPermanentError";
  }
}

@injectable()
export class GA4MeasurementService {
  async send(payload: GA4EventPayload): Promise<void> {
    const measurementId = process.env.GA4_MEASUREMENT_ID;
    const apiSecret = process.env.GA4_API_SECRET;

    if (!measurementId || !apiSecret) {
      throw new Error("Konfigurasi GA4 belum tersedia");
    }

    if (!/^\d+\.\d+$/.test(payload.client_id ?? "")) {
      throw new TrackingPermanentError("GA4 client_id tidak valid");
    }

    if (
      !Array.isArray(payload.events) ||
      payload.events.length < 1 ||
      payload.events.length > 25
    ) {
      throw new TrackingPermanentError("GA4 events tidak valid");
    }

    if (
      payload.events.some(
        (event) =>
          !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(event.name) ||
          !event.params ||
          typeof event.params !== "object" ||
          Array.isArray(event.params),
      )
    ) {
      throw new TrackingPermanentError(
        "Nama atau parameter event GA4 tidak valid",
      );
    }

    const nowMicros = Date.now() * 1000;

    if (payload.timestamp_micros !== undefined) {
      const ageMicros = nowMicros - payload.timestamp_micros;

      if (
        !Number.isSafeInteger(payload.timestamp_micros) ||
        ageMicros < -60_000_000 ||
        ageMicros > 72 * 60 * 60 * 1_000_000
      ) {
        throw new TrackingPermanentError(
          "Timestamp event berada di luar jendela pengiriman GA4",
        );
      }
    }

    const url = new URL("https://www.google-analytics.com/mp/collect");

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
      throw new Error(`GA4 Measurement Protocol HTTP ${response.status}`);
    }
  }
}
