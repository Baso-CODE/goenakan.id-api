import rateLimit from "express-rate-limit";

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100, // 100 requests per 15 min
  message: "Terlalu banyak request, coba lagi nanti",
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: (req) => {
    return req.ip === "127.0.0.1" || req.ip === "::1";
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5, // Hanya 5 kali login per 15 min
  message: "Terlalu banyak percobaan login, coba lagi dalam 15 menit",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit berdasarkan IP + email untuk tracking lebih akurat
    return `${req.ip}-${req.body?.email || "unknown"}`;
  },
  skip: (req) => {
    // Skip untuk localhost dev
    return req.ip === "127.0.0.1" || req.ip === "::1";
  },
});

export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Terlalu banyak request sensitif, coba lagi nanti",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === "127.0.0.1" || req.ip === "::1",
});

export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: "Terlalu banyak request, coba lagi nanti",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === "127.0.0.1" || req.ip === "::1",
});
