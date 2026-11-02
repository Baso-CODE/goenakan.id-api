import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateGuestOrderToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashGuestOrderToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyGuestOrderToken(
  token: string | undefined,
  storedHash: string | null,
): boolean {
  if (!token || !storedHash || token.length > 256) {
    return false;
  }

  const tokenHash = Buffer.from(hashGuestOrderToken(token), "hex");

  const expectedHash = Buffer.from(storedHash, "hex");

  if (tokenHash.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(tokenHash, expectedHash);
}
