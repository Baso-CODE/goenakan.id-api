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
        payload = jwt.verify(token, secret);
      } catch (verifyErr) {
        console.warn("⚠️ JWT Verify failed!");
        throw new ApiError(
          "Token verification failed: Invalid secret or token expired",
          401,
        );
      }

      if (!payload || typeof payload === "string") {
        throw new ApiError("Invalid token payload", 401);
      }

      const authReq = req as AuthenticatedRequest;

      // Perubahan di sini:
      // Karena Role bukan lagi enum, kita langsung pakai string "CUSTOMER"
      // as fallback jika payload.role kosong.
      authReq.user = {
        id: payload.id || payload.sub,
        email: payload.email,
        role: payload.role || "CUSTOMER",
      };

      next();
    } catch (err: any) {
      next(err);
    }
  };
}
