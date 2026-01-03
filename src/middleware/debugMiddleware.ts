// src/middleware/debug.middleware.ts

import { NextFunction, Request, Response } from "express";

export const debugMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.log("--- DEBUG MULTER OUTPUT (AFTER UPLOAD) ---"); // Tampilkan data non-file (string)
  console.log("req.body:", req.body); // Tampilkan file yang berhasil diunggah Multer
  // req.files adalah objek yang berisi array file untuk setiap field

  console.log("req.files:", req.files);
  console.log("------------------------------------------"); // Lanjutkan ke middleware berikutnya

  next();
};
