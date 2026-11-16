import { resolveLeadContactName, LeadResolutionInput } from "./contactNameResolver";

describe("resolveLeadContactName", () => {
  it("harus memprioritaskan displayName jika ada", () => {
    const input: LeadResolutionInput = {
      phoneNumber: "628123456789",
      displayName: "Pak Budi (Custom)",
      waPushName: "Budi Santoso",
      customerProfile: {
        accountType: "INDIVIDUAL",
        user: { name: "Budi Asli" },
      },
    };
    const res = resolveLeadContactName(input);
    expect(res.name).toBe("Pak Budi (Custom)");
    expect(res.source).toBe("DISPLAY_NAME");
    expect(res.formattedPhone).toBe("+62 812-3456-789");
  });

  it("harus menggunakan customerProfile corporate jika displayName kosong", () => {
    const input: LeadResolutionInput = {
      phoneNumber: "628123456789",
      displayName: null,
      waPushName: "Andi",
      customerProfile: {
        accountType: "CORPORATE",
        companyName: "PT Sinar Abadi",
        picName: "Andi Wijaya",
      },
    };
    const res = resolveLeadContactName(input);
    expect(res.name).toBe("PT Sinar Abadi (PIC: Andi Wijaya)");
    expect(res.source).toBe("CUSTOMER_PROFILE");
  });

  it("harus menggunakan customerProfile individual jika corporate company kosong", () => {
    const input: LeadResolutionInput = {
      phoneNumber: "628123456789",
      displayName: null,
      waPushName: "Bambang",
      customerProfile: {
        accountType: "INDIVIDUAL",
        user: { name: "Bambang Pamungkas" },
      },
    };
    const res = resolveLeadContactName(input);
    expect(res.name).toBe("Bambang Pamungkas");
    expect(res.source).toBe("CUSTOMER_PROFILE");
  });

  it("harus menggunakan waPushName jika tidak ada profile ERP", () => {
    const input: LeadResolutionInput = {
      phoneNumber: "628123456789",
      displayName: null,
      waPushName: "Rina Style",
    };
    const res = resolveLeadContactName(input);
    expect(res.name).toBe("Rina Style");
    expect(res.source).toBe("WA_PUSH_NAME");
  });

  it("harus fallback ke format nomor telepon internasional jika semua nama kosong", () => {
    const input: LeadResolutionInput = {
      phoneNumber: "628123456789",
      displayName: null,
      waPushName: null,
    };
    const res = resolveLeadContactName(input);
    expect(res.name).toBe("+62 812-3456-789");
    expect(res.source).toBe("PHONE_NUMBER");
  });
});
