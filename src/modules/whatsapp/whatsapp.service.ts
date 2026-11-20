import QRCode from "qrcode-terminal";
import { injectable } from "tsyringe";
import { Client, LocalAuth, MessageMedia } from "whatsapp-web.js";
@injectable()
export class WhatsappService {
  private client: Client | null = null;
  private isReady = false;
  private initPromise: Promise<void> | null = null; // 🔥 TAMBAH INI

  async initialize() {
    if (this.initPromise) return this.initPromise;

    // 🔥 Store promise untuk prevent multiple initializations
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize() {
    if (this.client) return;

    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    this.client.on("qr", (qr) => {
      console.log("📱 Scan QR Code di bawah ini dengan WhatsApp:");
      QRCode.generate(qr, { small: true });
    });

    this.client.on("authenticated", () => {
      console.log("✅ WhatsApp authenticated");
      this.isReady = true; // 🔥 Set true saat authenticated
    });

    this.client.on("auth_failure", () => {
      console.error("❌ WhatsApp auth failed");
      this.isReady = false;
    });

    this.client.on("disconnected", () => {
      console.log("🔌 WhatsApp disconnected");
      this.isReady = false;
    });

    await this.client.initialize(); // 🔥 Wait sampai fully initialized
  }

  async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
    // 🔥 TAMBAH: Wait sampai ready
    if (!this.client) {
      throw new Error("WhatsApp not initialized");
    }

    // Wait sampai authenticated (max 30 detik)
    let attempts = 0;
    while (!this.isReady && attempts < 30) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    if (!this.isReady) {
      throw new Error("WhatsApp client not ready after waiting");
    }

    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const chatId = `${formattedPhone}@c.us`;

      await this.client.sendMessage(chatId, message);
      console.log(`📤 Sent to ${formattedPhone}`);
      return true;
    } catch (error) {
      console.error("Send error:", error);
      return false;
    }
  }

  async sendMediaMessage(
    phoneNumber: string,
    mediaInput: {
      url?: string;
      buffer?: Buffer;
      base64?: string;
      mimetype?: string;
      fileName?: string;
    },
    caption?: string,
  ): Promise<boolean> {
    if (!this.client) {
      throw new Error("WhatsApp not initialized");
    }

    let attempts = 0;
    while (!this.isReady && attempts < 30) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    if (!this.isReady) {
      throw new Error("WhatsApp client not ready after waiting");
    }

    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const chatId = `${formattedPhone}@c.us`;

      let media: MessageMedia;

      if (mediaInput.url) {
        media = await MessageMedia.fromUrl(mediaInput.url, { unsafeMime: true });
        if (mediaInput.fileName) {
          media.filename = mediaInput.fileName;
        }
      } else if (mediaInput.buffer) {
        const mime = mediaInput.mimetype || "application/octet-stream";
        const base64Data = mediaInput.buffer.toString("base64");
        media = new MessageMedia(mime, base64Data, mediaInput.fileName || "attachment");
      } else if (mediaInput.base64) {
        const cleanBase64 = mediaInput.base64.replace(/^data:[^;]+;base64,/, "");
        const mime = mediaInput.mimetype || "application/octet-stream";
        media = new MessageMedia(mime, cleanBase64, mediaInput.fileName || "attachment");
      } else {
        throw new Error("No media source provided (url, buffer, or base64 required)");
      }

      const isPdf = media.mimetype?.includes("pdf") || media.filename?.endsWith(".pdf");
      await this.client.sendMessage(chatId, media, {
        caption: caption || undefined,
        sendMediaAsDocument: isPdf,
      });

      console.log(`📤 Sent media (${media.filename || "file"}) to ${formattedPhone}`);
      return true;
    } catch (error) {
      console.error("Send media error:", error);
      return false;
    }
  }

  private formatPhoneNumber(phone: string): string {
    if (!phone) return "";

    let cleaned = phone.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");

    if (cleaned.startsWith("0")) {
      cleaned = "62" + cleaned.substring(1);
    }

    if (!cleaned.match(/^[1-9]\d{1,3}/)) {
      cleaned = "62" + cleaned;
    }

    return cleaned;
  }

  async getStatus(): Promise<string> {
    return this.isReady ? "connected" : "disconnected";
  }

  async disconnect() {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      this.isReady = false;
    }
  }
}
