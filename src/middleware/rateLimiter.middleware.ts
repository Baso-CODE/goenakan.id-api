import { Request, Response } from "express";
import rateLimit from "express-rate-limit";

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 1000, // ⬆️ Dinaikkan dari 100 menjadi 1000 request per 15 menit
  message: "Terlalu banyak request, coba lagi nanti",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    return req.ip === "127.0.0.1" || req.ip === "::1";
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 20, // ⬆️ Dinaikkan dari 5 menjadi 20 (Memberi ruang jika user salah ketik password beberapa kali)
  message: "Terlalu banyak percobaan login, coba lagi dalam 15 menit",
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req: Request, res: Response): string => {
    const ip = req.ip || "unknown";
    const email = (req.body as any)?.email || "unknown";
    return `${ip}-${email}`;
  },

  skip: (req: Request) => {
    const ip = req.ip;
    return ip === "127.0.0.1" || ip === "::1" || !ip;
  },
});

export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100, // ⬆️ Dinaikkan dari 20 menjadi 100 request
  message: "Terlalu banyak request sensitif, coba lagi nanti",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.ip === "127.0.0.1" || req.ip === "::1",
});

export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 3000, // ⬆️ Dinaikkan dari 500 menjadi 3000 request (Sangat longgar untuk API publik)
  message: "Terlalu banyak request, coba lagi nanti",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.ip === "127.0.0.1" || req.ip === "::1",
});
