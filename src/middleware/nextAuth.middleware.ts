import { NextFunction, Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import { autoInjectable } from "tsyringe";

import { PrismaService } from "../modules/prisma/prisma.service";
import { ApiError } from "../utils/api-error";
import { AuthenticatedRequest } from "./AuthenticatedUser";

type NextAuthTokenPayload = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string;
  roleId?: string;
  permissions?: string[];
  permissionVersion?: number;
};

@autoInjectable()
export class NextAuthMiddleware {
  constructor(private readonly prisma?: PrismaService) {}

  private getSecret(): string {
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

      const token = authHeader.substring(7);
      const secret = this.getSecret();

      let payload: NextAuthTokenPayload;

      try {
        const decoded = jwt.verify(token, secret);

        if (!decoded || typeof decoded === "string") {
          throw new ApiError("Invalid token payload", 401);
        }

        payload = decoded as NextAuthTokenPayload;
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        console.warn("⚠️ JWT Verify failed");

        throw new ApiError(
          "Token verification failed: Invalid token or token expired",
          401,
        );
      }

      const userId = payload.id || payload.sub;

      if (!userId) {
        throw new ApiError("Unauthorized: User ID not found in token", 401);
      }

      if (!payload.roleId) {
        throw new ApiError("Unauthorized: Role ID not found in token", 401);
      }

      if (typeof payload.permissionVersion !== "number") {
        throw new ApiError("Permission version missing from token", 401);
      }

      if (!this.prisma) {
        throw new ApiError("Prisma service is unavailable", 500);
      }

      const currentUser = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          email: true,
          roleId: true,
          role: {
            select: {
              name: true,
              permissionVersion: true,
            },
          },
        },
      });

      if (!currentUser) {
        throw new ApiError("Unauthorized: User not found", 401);
      }

      if (!currentUser.role) {
        throw new ApiError("Unauthorized: User role not found", 401);
      }

      const roleChanged = currentUser.roleId !== payload.roleId;

      const permissionVersionChanged =
        currentUser.role.permissionVersion !== payload.permissionVersion;

      if (roleChanged || permissionVersionChanged) {
        res.status(401).json({
          code: "PERMISSION_VERSION_STALE",
          message: "Hak akses user telah berubah. Session perlu diperbarui.",
        });

        return;
      }

      const authReq = req as AuthenticatedRequest;

      authReq.user = {
        id: currentUser.id,
        email: currentUser.email || payload.email || "",
        role: currentUser.role.name,
        roleId: currentUser.roleId,
        permissions: Array.isArray(payload.permissions)
          ? payload.permissions
          : [],
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
