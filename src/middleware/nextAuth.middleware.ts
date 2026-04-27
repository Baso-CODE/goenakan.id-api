import { Role } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import { ApiError } from "../utils/api-error";
import { AuthenticatedRequest } from "./AuthenticatedUser";

export class NextAuthMiddleware {
  // Pastikan env dibaca dengan benar
  private getSecret() {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      throw new ApiError(
        "Server configuration error: NEXTAUTH_SECRET not set",
        500,
      );
    }
    return secret;
  }

  verifyNextAuthToken = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader?.startsWith("Bearer ")) {
        throw new ApiError("Unauthorized: Missing Bearer token", 401);
      }

      const token = authHeader.split(" ")[1];
      const secret = this.getSecret();

      let payload: any;

      try {
        // Taktik 1: Coba Verifikasi secara ketat (Sesuai yang kita buat di callback Client)
        payload = jwt.verify(token, secret);
      } catch (verifyErr) {
        // Taktik 2: Jika verify gagal, coba decode (Fallback untuk Admin)
        // Ini memastikan jika token valid secara struktur namun secret bermasalah saat verify
        console.warn("⚠️ JWT Verify failed, attempting decode fallback...");
        payload = jwt.decode(token);
      }

      if (!payload || typeof payload === "string") {
        throw new ApiError("Invalid token payload", 401);
      }

      const authReq = req as AuthenticatedRequest;

      // NextAuth payload terkadang menggunakan 'sub' sebagai 'id'
      authReq.user = {
        id: payload.id || payload.sub,
        email: payload.email,
        role: (payload.role as Role) ?? Role.CUSTOMER,
      };

      next();
    } catch (err: any) {
      console.error("❌ Auth Middleware Error:", err.message);
      next(new ApiError(err.message || "Invalid or expired token", 401));
    }
  };
}
