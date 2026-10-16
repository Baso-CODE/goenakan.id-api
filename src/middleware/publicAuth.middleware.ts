import { NextFunction, Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import { autoInjectable } from "tsyringe";
import { PrismaService } from "../modules/prisma/prisma.service";
import { ApiError } from "../utils/api-error";
import { AuthenticatedRequest } from "./AuthenticatedUser";

type PublicTokenPayload = {
  id: string;
  email?: string;
  role?: string;
  roleId?: string;
};

@autoInjectable()
export class PublicAuthMiddleware {
  constructor(private readonly prisma?: PrismaService) {}

  verifyPublicToken = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const header = req.headers.authorization;

      if (!header?.startsWith("Bearer ")) {
        throw new ApiError("Unauthorized: Missing Bearer token", 401);
      }

      const secret = process.env.NEXTAUTH_SECRET;
      if (!secret) {
        throw new ApiError("NEXTAUTH_SECRET is not configured", 500);
      }

      let payload: PublicTokenPayload;

      try {
        const decoded = jwt.verify(header.slice(7), secret);

        if (
          typeof decoded === "string" ||
          !decoded ||
          typeof decoded.id !== "string"
        ) {
          throw new Error("Invalid JWT payload");
        }

        payload = decoded as PublicTokenPayload;
      } catch {
        throw new ApiError("Invalid or expired token", 401);
      }

      if (!this.prisma) {
        throw new ApiError("Prisma service is unavailable", 500);
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          email: true,
          roleId: true,
          role: { select: { name: true } },
        },
      });

      if (!user || user.role?.name !== "CUSTOMER") {
        throw new ApiError("Unauthorized: Customer access required", 403);
      }

      const authReq = req as AuthenticatedRequest;
      authReq.user = {
        id: user.id,
        email: user.email,
        role: user.role.name,
        roleId: user.roleId,
        permissions: [],
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
