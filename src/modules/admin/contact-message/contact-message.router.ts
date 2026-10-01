import { Router } from "express";
import { autoInjectable } from "tsyringe";

import { NextAuthMiddleware } from "../../../middleware/nextAuth.middleware";
import { autoVerifyPermission } from "../../../middleware/permission.middleware";
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
    // ==========================================
    // === 1. PUBLIC ROUTES (Bebas diakses tanpa login)
    // ==========================================

    // Klien mengirim pesan dari Contact Form di Landing Page
    this.router.post("/", this.contactController.createMessage);

    // ==========================================
    // 🛡️ GATEKEEPER LEVEL ROUTER
    // Mulai baris ini ke bawah, semua route wajib login & punya permission dinamis.
    // ==========================================
    this.router.use(this.nextAuthMiddleware.verifyNextAuthToken);
    this.router.use(autoVerifyPermission("contact_message"));

    // ==========================================
    // === 2. ADMIN PROTECTED ROUTES ===
    // ==========================================

    // Admin melihat daftar semua pesan (pagination & search) -> Otomatis butuh 'read'
    this.router.get("/", this.contactController.getAllMessages);

    // Admin melihat detail pesan (mengubah status isRead: true) -> Otomatis butuh 'read'
    this.router.get("/:id", this.contactController.getMessageDetail);

    // Admin menghapus pesan spam atau lama -> Otomatis butuh 'delete'
    this.router.delete("/:id", this.contactController.deleteMessage);
  };

  getRouter(): Router {
    return this.router;
  }
}
