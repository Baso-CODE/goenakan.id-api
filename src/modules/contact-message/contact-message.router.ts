import { Router } from "express";
import { autoInjectable } from "tsyringe";
import { NextAuthMiddleware } from "../../middleware/nextAuth.middleware";
import { verifyRole } from "../../middleware/role.middleware";
import { ContactController } from "./contact-message.controller";

@autoInjectable()
export class ContactMessageRouter {
  private readonly router: Router = Router();

  constructor(
    private readonly contactController: ContactController,
    private readonly nextAuthMiddleware: NextAuthMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes = (): void => {
    // Inisialisasi Middleware
    const auth = this.nextAuthMiddleware.verifyNextAuthToken;
    const adminRole = verifyRole(["SUPER_ADMIN"]);

    // ==========================================
    // 1. PUBLIC ROUTES (Tanpa Autentikasi)
    // ==========================================

    // POST /api/contacts
    // Klien mengirim pesan dari Contact Form di Landing Page
    this.router.post("/", this.contactController.createMessage);

    // ==========================================
    // 2. ADMIN ROUTES (Gunakan Auth & Role)
    // ==========================================

    // GET /api/contacts
    // Admin melihat daftar semua pesan (lengkap dengan pagination & search)
    this.router.get(
      "/",
      auth,
      adminRole,
      this.contactController.getAllMessages,
    );

    // GET /api/contacts/:id
    // Admin melihat detail pesan (Otomatis mengubah status pesan menjadi isRead: true)
    this.router.get(
      "/:id",
      auth,
      adminRole,
      this.contactController.getMessageDetail,
    );

    // DELETE /api/contacts/:id
    // Admin menghapus pesan spam atau pesan lama
    this.router.delete(
      "/:id",
      auth,
      adminRole,
      this.contactController.deleteMessage,
    );
  };

  getRouter(): Router {
    return this.router;
  }
}
