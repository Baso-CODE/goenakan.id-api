import { NextFunction, Request, Response } from "express";
import { PermissionAction, PermissionModule } from "../config/permissions";

const METHOD_ACTION_MAP: Record<string, PermissionAction> = {
  GET: "read",
  HEAD: "read",
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

export const autoVerifyPermission = (
  moduleName: PermissionModule,
  customAction?: PermissionAction,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = (req as any).user;

      if (!user) {
        res.status(401).json({
          message: "Unauthorized: User session not found in request",
        });
        return;
      }

      if (user.role === "SUPER_ADMIN" || user.roleName === "SUPER_ADMIN") {
        next();
        return;
      }

      const action = customAction ?? METHOD_ACTION_MAP[req.method];

      if (!action) {
        res.status(405).json({
          message: `Method ${req.method} is not supported`,
        });
        return;
      }

      const requiredPermission = `${action}_${moduleName}`;

      const userPermissions: string[] =
        user.permissions ?? user.role?.permissions ?? [];

      if (!userPermissions.includes(requiredPermission)) {
        res.status(403).json({
          message: `Forbidden: Required permission ${requiredPermission}`,
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Error in autoVerifyPermission middleware:", error);

      res.status(500).json({
        message: "Internal server error in permission validation",
      });
    }
  };
};
