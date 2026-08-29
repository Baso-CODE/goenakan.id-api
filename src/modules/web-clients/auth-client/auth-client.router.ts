import { Router } from "express";
import { injectable } from "tsyringe";
import { validateBody } from "../../../middleware/validation.middleware";
import { AuthWebClientController } from "./auth-client.controller";
import { RegisterUserDTO } from "./dto/register-user.dto";

@injectable()
export class AuthWebClientRouter {
  private readonly router: Router = Router();

  constructor(private readonly authController: AuthWebClientController) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Endpoint Registrasi
    this.router.post(
      "/register-user-web-client",
      validateBody(RegisterUserDTO),
      this.authController.register,
    );

    // Endpoint Meminta Reset Password (Lupa Password)
    this.router.post("/forgot-password", this.authController.forgotPassword);

    // Endpoint Eksekusi Password Baru
    this.router.post("/reset-password", this.authController.resetPassword);
  };

  getRouter(): Router {
    return this.router;
  }
}
