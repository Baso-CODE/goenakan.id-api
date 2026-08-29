import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { AuthServiceWebClient } from "./auth-client.service";

@injectable()
export class AuthWebClientController {
  constructor(private readonly authService: AuthServiceWebClient) {}

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.authService.registerCustomer(req.body);
      res.status(201).json({
        success: true,
        message:
          "Registrasi berhasil! Silakan periksa kotak masuk email Anda untuk memverifikasi akun.",
        data: user,
      });
    } catch (error) {
      next(error);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ message: "Email wajib diisi" });
        return;
      }

      const result = await this.authService.requestPasswordReset(email);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        res
          .status(400)
          .json({ message: "Token dan password baru wajib diisi" });
        return;
      }

      const result = await this.authService.resetPassword(token, newPassword);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
