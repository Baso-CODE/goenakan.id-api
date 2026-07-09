import { Prisma } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error";

export function errorMiddleware(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("🔥 PRISMA KNOWN REQUEST ERROR 🔥", err);
    switch (err.code) {
      case "P2002":
        res.status(409).send({
          message: `Unique constraint violation: ${err.message}`,
          field: err.meta?.target,
        });
        break;
      case "P2003":
        res.status(400).send({
          message: `Foreign key constraint violation: ${err.message}`,
          field: err.meta?.field_name,
        });
        break;
      case "P2025":
        res.status(404).send({
          message: `Record not found: ${err.message}`,
          model: err.meta?.modelName,
        });
        break;
      default:
        res.status(500).send({
          message: "An unexpected Prisma error occurred.",
          code: err.code,
          details: err.message,
        });
        break;
    }
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error("🔥 PRISMA VALIDATION ERROR 🔥", err);
    res.status(400).send({
      message: "Prisma validation error.",
      details: err.message,
    });
    return;
  }

  const status = err.status || 500;
  const message = err.message || "Something went wrong";
  res.status(status).send({ message, stack: err.stack });
}
