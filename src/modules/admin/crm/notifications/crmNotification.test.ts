import "reflect-metadata";
import { CrmNotificationService } from "./crmNotification.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { WhatsappService } from "../../../whatsapp/whatsapp.service";
import { CrmTemplateService } from "../templates/crmTemplate.service";

describe("CrmNotificationService", () => {
  let service: CrmNotificationService;
  let mockPrisma: any;
  let mockWhatsappService: any;
  let mockCrmTemplateService: any;

  beforeEach(() => {
    mockPrisma = {
      whatsappMessage: {
        create: jest.fn().mockResolvedValue({
          id: "msg-123",
          status: "sent",
          sentAt: new Date(),
        }),
      },
      crmLead: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    mockWhatsappService = {
      sendMessage: jest.fn().mockResolvedValue(true),
      sendMediaMessage: jest.fn().mockResolvedValue(true),
    };

    mockCrmTemplateService = {
      findTemplateByIdentifier: jest.fn(),
    };

    service = new CrmNotificationService(
      mockPrisma as PrismaService,
      mockWhatsappService as WhatsappService,
      mockCrmTemplateService as CrmTemplateService,
    );
  });

  it("should send raw text message successfully", async () => {
    const result = await service.sendNotification({
      phoneNumber: "08123456789",
      message: "Halo, invoice INV_001 sudah diterbitkan.",
      category: "INVOICE",
      referenceId: "INV_001",
    });

    expect(result.success).toBe(true);
    expect(result.recipient).toBe("628123456789");
    expect(result.renderedMessage).toBe("Halo, invoice INV_001 sudah diterbitkan.");
    expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
      "628123456789",
      "Halo, invoice INV_001 sudah diterbitkan.",
    );
    expect(mockPrisma.whatsappMessage.create).toHaveBeenCalled();
  });

  it("should replace dynamic variables using CRM template", async () => {
    mockCrmTemplateService.findTemplateByIdentifier.mockResolvedValue({
      id: "tpl-1",
      title: "Notifikasi Invoice Diterbitkan",
      shortcut: "/notif-invoice",
      content:
        "Halo Kak {{nama}}, invoice {{nomor_invoice}} sebesar {{total}} telah terbit. Link: {{link}}",
    });

    const result = await service.sendNotification({
      phoneNumber: "08987654321",
      template: "/notif-invoice",
      variables: {
        nama: "PT Maju Bersama",
        nomor_invoice: "INV_0105",
        total: "Rp 15.000.000",
        link: "https://goenakan.id/inv/105",
      },
      category: "INVOICE",
    });

    expect(result.success).toBe(true);
    expect(result.renderedMessage).toBe(
      "Halo Kak PT Maju Bersama, invoice INV_0105 sebesar Rp 15.000.000 telah terbit. Link: https://goenakan.id/inv/105",
    );
    expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
      "628987654321",
      expect.stringContaining("PT Maju Bersama"),
    );
  });

  it("should send media message when mediaUrl is provided", async () => {
    const result = await service.sendNotification({
      phoneNumber: "08123456789",
      message: "Berikut dokumen invoice Anda.",
      mediaUrl: "https://api.goenakan.id/uploads/invoices/INV_001.pdf",
      fileName: "INV_001.pdf",
    });

    expect(result.success).toBe(true);
    expect(result.hasMedia).toBe(true);
    expect(mockWhatsappService.sendMediaMessage).toHaveBeenCalledWith(
      "628123456789",
      {
        url: "https://api.goenakan.id/uploads/invoices/INV_001.pdf",
        fileName: "INV_001.pdf",
      },
      "Berikut dokumen invoice Anda.",
    );
  });

  it("should throw error if neither template nor message is provided", async () => {
    await expect(
      service.sendNotification({
        phoneNumber: "08123456789",
      }),
    ).rejects.toThrow("Wajib menyertakan salah satu antara 'template'");
  });

  it("should throw error if template is not found in database", async () => {
    mockCrmTemplateService.findTemplateByIdentifier.mockResolvedValue(null);

    await expect(
      service.sendNotification({
        phoneNumber: "08123456789",
        template: "/not-found",
      }),
    ).rejects.toThrow('Template "/not-found" tidak ditemukan');
  });
});
