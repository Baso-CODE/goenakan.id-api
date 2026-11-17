import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { autoInjectable } from "tsyringe";
import { ClientController } from "./client.controller";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
import { validateBody } from "../../../middleware/validation.middleware";
import { CreateClientDTO } from "./dto/createClient.dto";

const upload = multer({ storage: multer.memoryStorage() });
const parseClientPics = (req: Request, res: Response, next: NextFunction) => {
  if (typeof req.body?.pics === "string") {
    try {
      req.body.pics = JSON.parse(req.body.pics);

      if (!Array.isArray(req.body.pics)) {
        res.status(400).json({
          message: "Data PIC harus berupa daftar.",
        });
        return;
      }
    } catch {
      res.status(400).json({
        message: "Format data PIC tidak valid.",
      });
      return;
    }
  }

  next();
};
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
    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Pasang pelindung token dan permission dinamis di sini satu kali saja.
    // Seluruh route di bawahnya otomatis aman.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission("client"));

    // ==========================================
    // === CLIENT MANAGEMENT ROUTES ===
    // ==========================================

    // 1. Get All Clients -> Otomatis butuh 'read'
    this.router.get("/", this.clientController.getAllClients);

    // 2. Get Clients For Order (Statis di atas `/:id`) -> Otomatis butuh 'read'
    this.router.get("/order", this.clientController.getAllClientsForOrder);

    // 3. Export Excel (Statis di atas `/:id`) -> Otomatis butuh 'read'
    this.router.get("/export/excel", this.clientController.exportClients);

    // 4. Get Client By ID -> Otomatis butuh 'read'
    this.router.get("/:id", this.clientController.getClientById);

    // 5. Create Client -> Otomatis butuh 'create'
    this.router.post(
      "/",
      upload.single("logoFile"),
      parseClientPics,
      validateBody(CreateClientDTO),
      this.clientController.createClient,
    );

    // 6. Update Client -> Otomatis butuh 'update'
    this.router.patch(
      "/:id",
      upload.single("logoFile"),
      this.clientController.updateClient,
    );

    // 7. Delete Client -> Otomatis butuh 'delete'
    this.router.delete("/:id", this.clientController.deleteClient);
  };

  getRouter(): Router {
    return this.router;
  }
}
