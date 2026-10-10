import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const isLocalhost = (req: Request): boolean => {
  if (process.env.NODE_ENV === "production") return false;
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip || "");
};

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  message: "Terlalu banyak request, coba lagi nanti",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: isLocalhost,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Terlalu banyak percobaan login, coba lagi dalam 15 menit",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    return ipKeyGenerator(req.ip || "unknown");
  },
  skip: isLocalhost,
});

export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message: "Terlalu banyak request sensitif, coba lagi nanti",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: isLocalhost,
});

export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  message: "Terlalu banyak request, coba lagi nanti",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: isLocalhost,
});
