// src/middleware/parseFormData.middleware.ts

import { NextFunction, Request, Response } from "express";

// Definisi ulang tipe Request untuk mengakomodasi data JSON mentah dan hasil parsing
interface CustomRequest extends Request {
  body: {
    data?: string; // String JSON mentah dari FormData
    [key: string]: any; // Untuk menampung hasil parsing
  };
}

export const parseFormData = (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  const jsonStringPayload = req.body.data;

  if (jsonStringPayload) {
    try {
      const parsedData = JSON.parse(jsonStringPayload); // Menggabungkan properti dari parsedData ke req.body.
      // Ini menimpa nilai string yang sudah ada dengan tipe data aslinya (number, boolean, array, object).

      req.body = {
        // Pertahankan properti lain yang mungkin ditambahkan oleh multer jika ada
        ...req.body,
        // Timpa req.body dengan data yang sudah diparse
        ...parsedData,
      };

      // Hapus string JSON mentah
      delete req.body.data;
    } catch (error) {
      // Handle error jika JSON string tidak valid
      console.error("Error parsing JSON payload in form data:", error);
      return next(new Error("Invalid JSON payload for product data."));
    }
  }

  next();
};
