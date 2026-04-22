import { Role } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import { ApiError } from "../utils/api-error";
import { AuthenticatedRequest } from "./AuthenticatedUser";

export class NextAuthMiddleware {
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

    const token = authHeader.split(" ")[1];

    if (!this.NEXTAUTH_SECRET) {
      throw new ApiError("Server configuration error: Secret not set", 500);
    }

    try {
      // ✨ GANTI decode() dengan jwt.verify()
      const payload = jwt.verify(token, this.NEXTAUTH_SECRET) as any;

      if (!payload) {
        throw new ApiError("Invalid token payload", 401);
      }

      const authReq = req as AuthenticatedRequest;
      authReq.user = {
        id: payload.id,
        email: payload.email,
        role: (payload.role as Role) ?? Role.CUSTOMER,
      };

      next();
    } catch (err: any) {
      console.error("❌ Token verification failed:", err.message);

      throw new ApiError("Invalid or expired token", 401);
    }
  };
}
