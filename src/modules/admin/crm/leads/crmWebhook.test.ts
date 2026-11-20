import "reflect-metadata";
import { CrmLeadService } from "./crmLead.service";

describe("CrmLeadService - processWebhookEvent", () => {
  let crmLeadService: CrmLeadService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      crmSetting: {
        findUnique: jest.fn().mockResolvedValue({
          id: "default",
          ignoreGroups: true,
          ignoreBroadcasts: true,
          blacklistedNumbers: "628999999999",
        }),
      },
      crmLead: {
        findUnique: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      crmCustomCode: {
        findUnique: jest.fn(),
      },
      whatsappClick: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      customerProfile: {
        findFirst: jest.fn(),
      },
    };

    crmLeadService = new CrmLeadService(mockPrisma);
  });

  it("harus mengabaikan payload kosong atau non-objek", async () => {
    const res = await crmLeadService.processWebhookEvent(null);
    expect(res.handled).toBe(false);
  });

  it("harus mengabaikan event selain pesan (misal session.status atau message.ack)", async () => {
    const res = await crmLeadService.processWebhookEvent({
      event: "session.status",
      session: "gi",
      payload: { status: "WORKING" },
    });
    expect(res.handled).toBe(false);
    expect(res.reason).toContain("diabaikan");
  });

  it("harus mengabaikan pesan grup WhatsApp jika ignoreGroups aktif", async () => {
    const res = await crmLeadService.processWebhookEvent({
      event: "message",
      session: "gi",
      payload: {
        from: "1203630248472910@g.us",
        body: "Halo grup",
      },
    });
    expect(res.handled).toBe(false);
    expect(res.reason).toContain("grup diabaikan");
  });

  it("harus mengabaikan nomor yang ada dalam blacklist", async () => {
    const res = await crmLeadService.processWebhookEvent({
      event: "message.any",
      payload: {
        from: "08999999999@c.us",
        body: "Pesan spam",
      },
    });
    expect(res.handled).toBe(false);
    expect(res.reason).toContain("blacklist");
  });

  it("harus memproses pesan masuk pelanggan (fromMe: false) dan membuat/mengupdate lead", async () => {
    const mockLead = {
      id: "lead-123",
      phoneNumber: "628123456789",
      lastMessage: "Halo saya mau pesan seragam [REF:IG-BIO]",
      status: "NEW",
    };

    mockPrisma.crmLead.findUnique.mockResolvedValue(null);
    mockPrisma.customerProfile.findFirst.mockResolvedValue(null);
    mockPrisma.crmCustomCode.findUnique.mockResolvedValue({
      id: "code-1",
      code: "IG-BIO",
      type: "CAMPAIGN",
    });
    mockPrisma.crmLead.upsert.mockResolvedValue(mockLead);

    const res = await crmLeadService.processWebhookEvent({
      event: "message",
      session: "gi",
      payload: {
        from: "0812-3456-789@c.us",
        body: "Halo saya mau pesan seragam [REF:IG-BIO]",
        fromMe: false,
        timestamp: 1732000000,
        _data: {
          notifyName: "Andi Saputra",
        },
      },
    });

    expect(res.handled).toBe(true);
    expect(res.lead).toBeDefined();
    expect(mockPrisma.crmLead.upsert).toHaveBeenCalled();
  });

  it("harus memproses pesan keluar dari CS (fromMe: true) jika lead sudah ada", async () => {
    mockPrisma.crmLead.findUnique.mockResolvedValue({
      id: "lead-123",
      phoneNumber: "628123456789",
      lastMessage: "Pesan lama",
      unreadCount: 2,
    });
    mockPrisma.crmLead.update.mockResolvedValue({
      id: "lead-123",
      phoneNumber: "628123456789",
      lastMessage: "Siap kak, segera kami buatkan penawarannya",
      unreadCount: 0,
    });

    const res = await crmLeadService.processWebhookEvent({
      event: "message",
      session: "gi",
      payload: {
        from: "628123456789@c.us",
        body: "Siap kak, segera kami buatkan penawarannya",
        fromMe: true,
        timestamp: 1732000100,
      },
    });

    expect(res.handled).toBe(true);
    expect(mockPrisma.crmLead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead-123" },
        data: expect.objectContaining({
          lastMessage: "Siap kak, segera kami buatkan penawarannya",
          unreadCount: 0,
        }),
      })
    );
  });

  it("harus mengklasifikasikan pesan secara otomatis ke label produk, sablon, dan intent", () => {
    const text = "Halo admin, mau tanya harga bikin kaos combed sablon dtf 100 pcs untuk event kantor deadline minggu depan";
    const labels = crmLeadService.classifyMessageContent(text, ["VIP"]);

    expect(labels).toContain("VIP");
    expect(labels).toContain("Kaos");
    expect(labels).toContain("Sablon");
    expect(labels).toContain("Tanya Harga");
    expect(labels).toContain("Urgent / Deadline");
    expect(labels).toContain("Partai Besar");
  });
});
