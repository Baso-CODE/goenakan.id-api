import { NextFunction, Request, Response } from "express";

export const verifySuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({
      message: "Unauthorized: User session not found in request",
    });
    return;
  }

  if (user.role !== "SUPER_ADMIN" && user.roleName !== "SUPER_ADMIN") {
    res.status(403).json({
      message: "Forbidden: Super Admin access required",
    });
    return;
  }

  next();
};
