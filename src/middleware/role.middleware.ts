import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error";
import { AuthenticatedRequest } from "./AuthenticatedUser";

export const verifyRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const userRole = authReq.user?.role;

    if (!userRole || !roles.includes(userRole)) {
      throw new ApiError("Forbidden: insufficient permissions", 403);
    }

    next();
  };
};
