import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { ClientController } from "./client.controller";

import { CreateClientDTO } from "./dto/createClient.dto";
import { UpdateClientDTO } from "./dto/updateClient.dto";
import { env } from "../../config";
import { JwtMiddleware } from "../../middleware/jwt.middleware";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";

@autoInjectable()
export class ClientRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly clientController: ClientController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    this.router.get(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.clientController.getAllClients,
    );
    this.router.get(
      "/order",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.clientController.getAllClientsForOrder,
    );

    this.router.get(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.clientController.getClientById,
    );

    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateClientDTO),
      this.clientController.createClient,
    );

    this.router.patch(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(UpdateClientDTO),
      this.clientController.updateClient,
    );

    this.router.delete(
      "/:id",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.clientController.deleteClient,
    );
    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.clientController.exportClients,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
