import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { AuthServiceWebClient } from "./register-user.service";

@injectable()
export class AuthWebClientController {
  constructor(private readonly authService: AuthServiceWebClient) {}

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.authService.registerCustomer(req.body);
      res.status(201).json({
        success: true,
        message: "Registrasi berhasil! Silakan login.",
        data: user,
      });
    } catch (error) {
      next(error);
    }
  };
}
