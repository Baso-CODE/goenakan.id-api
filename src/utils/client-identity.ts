import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { ApiError } from "./api-error";

/** Internal CRM identity only; NEVER use for customer authentication. */
export function normalizeClientPhone(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits || digits.length < 8 || digits.length > 17) return null;

  let normalized: string;
  if (raw.startsWith("+")) normalized = digits;
  else if (digits.startsWith("00")) normalized = digits.slice(2);
  else if (digits.startsWith("62")) normalized = digits;
  else if (digits.startsWith("0")) normalized = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) normalized = `62${digits}`;
  else normalized = digits;

  return normalized.length >= 8 && normalized.length <= 15
    ? normalized
    : null;
}

export function normalizeClientName(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("id-ID");
}

/** Stable hash: avoids exposing phone/name in a unique DB index. */
export function buildB2CIdentityKey(
  name: string | null | undefined,
  phone: string | null | undefined,
): string | null {
  const normalizedName = normalizeClientName(name);
  const normalizedPhone = normalizeClientPhone(phone);
  if (!normalizedName || !normalizedPhone) return null;
  return createHash("sha256")
    .update(`b2c-v1\u0000${normalizedPhone}\u0000${normalizedName}`)
    .digest("hex");
}

/**
 * Finds the canonical Client for an exact normalized (name + phone) pair.
 * The fallback also recognizes older rows with identityKey=NULL.
 * Existing duplicate legacy rows are NOT automatically merged.
 */
export async function findB2CClientByIdentity(
  tx: Prisma.TransactionClient,
  name: string | null | undefined,
  phone: string | null | undefined,
) {
  const identityKey = buildB2CIdentityKey(name, phone);
  const normalizedPhone = normalizeClientPhone(phone);
  if (!identityKey || !normalizedPhone) return null;

  // Last four digits are used only to limit the legacy candidate search.
  // Full normalized phone + normalized name is compared in application code.
  const candidates = await tx.clientB2C.findMany({
    where: {
      OR: [
        { identityKey },
        { phone: { contains: normalizedPhone.slice(-4) } },
      ],
    },
    include: {
      client: {
        select: { createdAt: true, userId: true },
      },
    },
  });

  const matched = candidates.filter(
    (candidate) =>
      candidate.identityKey === identityKey ||
      buildB2CIdentityKey(candidate.name, candidate.phone) === identityKey,
  );

  // Prefer a record that already owns the unique key; otherwise pick
  // the oldest legacy record deterministically without merging old rows.
  matched.sort((a, b) =>
    Number(b.identityKey === identityKey) -
      Number(a.identityKey === identityKey) ||
    a.client.createdAt.getTime() - b.client.createdAt.getTime() ||
    a.id.localeCompare(b.id),
  );

  return matched[0] ?? null;
}


/** CRM identity for a business entity (company name + contact phone). */
export function buildB2BIdentityKey(
  companyName: string | null | undefined,
  phone: string | null | undefined,
): string | null {
  const normalizedName = normalizeClientName(companyName);
  const normalizedPhone = normalizeClientPhone(phone);
  if (!normalizedName || !normalizedPhone) return null;
  return createHash("sha256")
    .update(`b2b-v1\u0000${normalizedPhone}\u0000${normalizedName}`)
    .digest("hex");
}

/** Reuses a CRM business client only on exact normalized company+phone match. */
export async function findB2BClientByIdentity(
  tx: Prisma.TransactionClient,
  companyName: string | null | undefined,
  phone: string | null | undefined,
) {
  const identityKey = buildB2BIdentityKey(companyName, phone);
  const normalizedPhone = normalizeClientPhone(phone);
  if (!identityKey || !normalizedPhone) return null;

  // Legacy clients may have identityKey=NULL until touched/migrated.
  const candidates = await tx.clientB2B.findMany({
    where: {
      OR: [
        { identityKey },
        { phone: { contains: normalizedPhone.slice(-4) } },
      ],
    },
    include: {
      client: {
        select: { createdAt: true, userId: true },
      },
    },
  });

  const matches = candidates.filter(
    (candidate) =>
      candidate.identityKey === identityKey ||
      buildB2BIdentityKey(candidate.companyName, candidate.phone) === identityKey,
  );

  matches.sort((a, b) =>
    Number(b.identityKey === identityKey) - Number(a.identityKey === identityKey) ||
    a.client.createdAt.getTime() - b.client.createdAt.getTime() ||
    a.id.localeCompare(b.id),
  );
  return matches[0] ?? null;
}


/**
 * Resolve a Client by its normalized primary phone across B2B and B2C.
 * Legacy records have phoneNormalized=NULL and are scanned as a compatibility
 * fallback until backfilled; no legacy rows are merged automatically.
 * Never use this CRM match as website login/ownership verification.
 */
export async function findClientByPhone(
  tx: Prisma.TransactionClient,
  phone: string | null | undefined,
) {
  const normalized = normalizeClientPhone(phone);
  if (!normalized) return null;

  const direct = await tx.client.findUnique({
    where: { phoneNormalized: normalized },
    include: { b2b: true, b2c: true },
  });
  if (direct) return direct;

  // Exhaustive fallback so any old formatting is recognized (e.g. 08, +62,
  // punctuation/spaces). A one-time backfill is advised at higher scale.
  const legacy = await tx.client.findMany({
    where: { phoneNormalized: null },
    include: { b2b: true, b2c: true },
  });
  const matches = legacy.filter((client) =>
    normalizeClientPhone(
      client.type === "B2B" ? client.b2b?.phone : client.b2c?.phone,
    ) === normalized,
  );
  if (matches.length > 1) {
    throw new ApiError(
      "Nomor HP ditemukan pada beberapa Client lama. Hubungi admin untuk verifikasi sebelum melanjutkan.",
      409,
    );
  }
  return matches[0] ?? null;
}
