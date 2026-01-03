import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error";
import { AuthenticatedRequest } from "./AuthenticatedUser";

import { decode } from "next-auth/jwt";
import { Role } from "@prisma/client";

export class NextAuthMiddleware {
  // PENTING: NEXTAUTH_SECRET harus sama di backend dan frontend
  private readonly NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

  verifyNextAuthToken = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new ApiError("Unauthorized: Missing Bearer token", 401);
    }

    const encryptedToken = authHeader.split(" ")[1];

    if (!this.NEXTAUTH_SECRET) {
      console.error("NEXTAUTH_SECRET is not set!");
      throw new ApiError("Server configuration error", 500);
    }

    try {
      // 🛑 MENGGUNAKAN DECODE dari next-auth/jwt
      const payload = await decode({
        token: encryptedToken,
        secret: this.NEXTAUTH_SECRET,
      });

      if (!payload) {
        throw new Error("Invalid token payload or token expired");
      }

      const authReq = req as AuthenticatedRequest;
      authReq.user = {
        id: String(payload.id ?? payload.sub ?? ""),
        email: String(payload.email ?? ""),
        role: (payload.role as Role) ?? Role.SUPER_ADMIN,
      };

      next();
    } catch (err) {
      console.error("❌ Token verification failed:", err);
      throw new ApiError("Invalid or expired token", 401);
    }
  };
}
