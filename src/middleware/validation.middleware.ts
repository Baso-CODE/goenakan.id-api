import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { NextFunction, Request, Response } from "express";

export function validateBody(dtoClass: any) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const dtoInstance = plainToInstance(dtoClass, req.body, {
      enableImplicitConversion: false,
      excludeExtraneousValues: false,
    });

    const errors = await validate(dtoInstance, {
      skipUndefinedProperties: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      const message = errors
        .map((error) => Object.values(error.constraints || {}).join(", "))
        .join(", ");

      res.status(400).send({ message });
      return;
    }
    req.body = dtoInstance;

    next();
  };
}
