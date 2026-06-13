import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { ClientController } from "./client.controller";

import multer from "multer";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { CreateClientDTO } from "./dto/createClient.dto";
import { UpdateClientDTO } from "./dto/updateClient.dto";

const upload = multer({ storage: multer.memoryStorage() });

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
    this.router.get(
      "/export/excel",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      this.clientController.exportClients,
    );
    this.router.post(
      "/",
      this.nextAuthMiddleware.verifyNextAuthToken,
      verifyRole(["SUPER_ADMIN"]),
      validateBody(CreateClientDTO),
      upload.single("logoFile"),
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
  };

  getRouter(): Router {
    return this.router;
  }
}
