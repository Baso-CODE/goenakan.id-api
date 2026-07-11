import rateLimit from "express-rate-limit";

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Terlalu banyak request, coba lagi nanti",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.ip === "127.0.0.1" || req.ip === "::1";
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Terlalu banyak percobaan login, coba lagi dalam 15 menit",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ipKey = req.ip;
    return `${ipKey}-${req.body?.email || "unknown"}`;
  },
  skip: (req) => {
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
