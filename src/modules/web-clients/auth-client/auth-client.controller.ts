import { NextFunction, Request, Response } from "express";
import { injectable } from "tsyringe";
import { AuthServiceWebClient } from "./auth-client.service";

@injectable()
export class AuthWebClientController {
  constructor(private readonly authService: AuthServiceWebClient) {}

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lang = (req.headers["accept-language"] as "id" | "en") || "id";

      // Kirim parameter lang ke service
      const user = await this.authService.registerCustomer(req.body, lang);

      res.status(201).json({
        success: true,
        message:
          lang === "en" ? "Registration successful!" : "Registrasi berhasil!",
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

  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.body;
      if (!token) {
        res.status(400).json({ message: "Token verifikasi wajib diisi" });
        return;
      }

      const result = await this.authService.verifyEmail(token);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}
