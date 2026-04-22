import { Router } from "express";
import { injectable } from "tsyringe";
import { validateBody } from "../../../middleware/validation.middleware";
import { RegisterUserDTO } from "./dto/register-user.dto";
import { AuthWebClientController } from "./register-user.controller";

@injectable()
export class AuthWebClientRouter {
  private readonly router: Router = Router();

  constructor(private readonly authController: AuthWebClientController) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.post(
      "/register-user-web-client",
      validateBody(RegisterUserDTO),
      this.authController.register,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
