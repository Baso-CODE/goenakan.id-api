import { Prisma } from "@prisma/client";

export type QuotationTrackingStatus = "SENT" | "ACCEPTED";

type Attribution = {
  ga_client_id?: string | null;
  ga_session_id?: string | number | null;
};

interface BuildQuotationEventInput {
  quotationId: string;
  quotationNumber: string;
  status: QuotationTrackingStatus;
  attribution: Prisma.JsonValue | null;
  timestamp: Date;
}

export function buildQuotationTrackingEvent(input: BuildQuotationEventInput) {
  const attribution =
    input.attribution &&
    typeof input.attribution === "object" &&
    !Array.isArray(input.attribution)
      ? (input.attribution as Attribution)
      : null;

  const clientId = attribution?.ga_client_id;

  if (typeof clientId !== "string" || !/^\d+\.\d+$/.test(clientId)) {
    return null;
  }

  const eventName =
    input.status === "SENT" ? "qualify_lead" : "close_convert_lead";

  const params: Record<string, unknown> = {
    quotation_id: input.quotationId,
    quotation_number: input.quotationNumber,
    engagement_time_msec: 1,
  };

  const sessionId = attribution?.ga_session_id;

  if (sessionId != null && /^\d+$/.test(String(sessionId))) {
    params.session_id = Number(sessionId);
  }

  return {
    eventKey: `ga4:${eventName}:quotation:${input.quotationId}`,
    eventName,
    destination: "GA4" as const,

    payload: {
      client_id: clientId,
      timestamp_micros: input.timestamp.getTime() * 1000,
      events: [
        {
          name: eventName,
          params,
        },
      ],
    } as Prisma.InputJsonValue,
  };
}
