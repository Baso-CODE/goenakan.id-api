import { Request } from "express";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  roleId: string;
  permissions?: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
