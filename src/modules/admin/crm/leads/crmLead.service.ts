import { CrmAssignMethod } from "@prisma/client";
import { injectable, singleton } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { PrismaService } from "../../../prisma/prisma.service";
import { resolveLeadContactName } from "../helpers/contactNameResolver";

export interface SyncLeadResult {
  totalChats: number;
  synced: number;
  created: number;
  updated: number;
  ignored: number;
}

export interface ClassificationRule {
  label: string;
  color: string;
  keywords: RegExp;
}

export const CRM_CLASSIFICATION_RULES: ClassificationRule[] = [
  // 1. Kategori Produk
  { label: "Kaos", color: "#0284c7", keywords: /\b(kaos|t-?shirt|combed|raglan|cotton|tshirt)\b/i },
  { label: "Polo", color: "#0ea5e9", keywords: /\b(polo|wangk[iy]|lacoste)\b/i },
  { label: "Kemeja", color: "#2563eb", keywords: /\b(kemeja|pdl|pdh|workshirt|flanel|almamater|jas)\b/i },
  { label: "Jaket / Hoodie", color: "#4f46e5", keywords: /\b(jaket|hoodie|zipper|sweater|varsity|bomber|windbreaker|parka)\b/i },
  { label: "Seragam", color: "#7c3aed", keywords: /\b(seragam|wearpack|rompi|vest|apron|celemek)\b/i },
  { label: "Jersey", color: "#06b6d4", keywords: /\b(jersey|dryfit|drifit|futsal|sepakbola|olahraga)\b/i },
  { label: "Merchandise", color: "#0891b2", keywords: /\b(merchandise|merch|tote\s*bag|goodie\s*bag|topi|pouch|mug|lanyard|payung|tumbler|souvenir)\b/i },

  // 2. Teknik Cetak / Sablon / Aplikasi
  { label: "Sablon", color: "#10b981", keywords: /\b(sablon|dtf|plastisol|rubber|discharge|screen\s*printing)\b/i },
  { label: "Bordir", color: "#059669", keywords: /\b(bordir|embroidery|jahit|emblem)\b/i },
  { label: "Sublim", color: "#14b8a6", keywords: /\b(sublim|sublimasi|fullprint)\b/i },

  // 3. Kebutuhan / Intent Pelanggan
  { label: "Tanya Harga", color: "#d97706", keywords: /\b(harga|biaya|biayanya|pricelist|price\s*list|berapa(an)?|tarif|penawaran|quotation|ongkos)\b/i },
  { label: "Minta Katalog", color: "#ea580c", keywords: /\b(katalog|catalog|portofolio|porto|contoh\s*(desain|produk)|model-model|lihat\s*contoh)\b/i },
  { label: "Minta Sampel", color: "#c026d3", keywords: /\b(sampel|sample|proofing|sample\s*kain|tester)\b/i },
  { label: "Urgent / Deadline", color: "#dc2626", keywords: /\b(urgent|cepat|deadline|mendesak|butuh\s*cepat|buru-?buru|besok|lusa|pekan\s*ini|minggu\s*depan)\b/i },
  { label: "Partai Besar", color: "#b45309", keywords: /\b(partai(\s*besar)?|ribuan|ratusan\s*pcs|\d+\s*(?:pcs|lusin|biji|potong)|grosir|kuantitas|jumlah\s*banyak|order\s*banyak)\b/i },
  { label: "Konsultasi Desain", color: "#9333ea", keywords: /\b(desain|design|mockup|vektor|vector|bikin\s*logo|format\s*file|corel|ai|cdr)\b/i },
];

@singleton()
@injectable()
export class CrmLeadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper normalisasi nomor telepon ke format E.164 (628...)
   */
  private normalizePhoneNumber(phone: string): string {
    let cleaned = phone.replace(/@c\.us$/i, "").replace(/@g\.us$/i, "").replace(/\D/g, "");
    if (cleaned.startsWith("08")) {
      cleaned = "62" + cleaned.slice(1);
    }
    return cleaned;
  }

  async getLeads(params: {
    status?: string;
    assignedTo?: string; // 'me', 'unassigned', or specific userId
    currentUserId?: string;
    search?: string;
    tag?: string;
    sourceCode?: string;
    trafficSource?: string; // 'all' | 'website' | 'master_code' | 'direct'
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.sourceCode && params.sourceCode.trim().length > 0) {
      where.sourceCode = {
        code: params.sourceCode.trim(),
      };
    }

    if (params.trafficSource === "website") {
      where.whatsappClickId = { not: null };
    } else if (params.trafficSource === "master_code") {
      where.sourceCodeId = { not: null };
    } else if (params.trafficSource === "direct") {
      where.whatsappClickId = null;
      where.sourceCodeId = null;
    }

    if (params.assignedTo === "unassigned") {
      where.assignedToUserId = null;
    } else if (params.assignedTo === "me" && params.currentUserId) {
      where.assignedToUserId = params.currentUserId;
    } else if (params.assignedTo && params.assignedTo !== "all") {
      where.assignedToUserId = params.assignedTo;
    }

    if (params.tag && params.tag.trim().length > 0) {
      where.labels = { contains: params.tag.trim() };
    }

    if (params.search && params.search.trim().length > 0) {
      const q = params.search.trim();
      where.OR = [
        { phoneNumber: { contains: q } },
        { displayName: { contains: q } },
        { waPushName: { contains: q } },
        { lastMessage: { contains: q } },
        { labels: { contains: q } },
        { customerProfile: { companyName: { contains: q } } },
        { customerProfile: { picName: { contains: q } } },
        { customerProfile: { user: { name: { contains: q } } } },
        { sourceCode: { code: { contains: q } } },
        { whatsappClick: { code: { contains: q } } },
        { whatsappClick: { pagePath: { contains: q } } },
        { whatsappClick: { ctaName: { contains: q } } },
      ];
    }

    const [total, items, totalAll, totalMe, totalUnassigned] = await Promise.all([
      this.prisma.crmLead.count({ where }),
      this.prisma.crmLead.findMany({
        where,
        include: {
          customerProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          assignedToUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          sourceCode: true,
          whatsappClick: {
            select: {
              id: true,
              code: true,
              pagePath: true,
              ctaName: true,
              attribution: true,
              createdAt: true,
            },
          },
          statusConfig: true,
          _count: {
            select: {
              notes: true,
            },
          },
        },
        orderBy: [
          { lastMessageAt: "desc" },
          { updatedAt: "desc" },
        ],
        skip,
        take: limit,
      }),
      this.prisma.crmLead.count(),
      params.currentUserId
        ? this.prisma.crmLead.count({ where: { assignedToUserId: params.currentUserId } })
        : 0,
      this.prisma.crmLead.count({ where: { assignedToUserId: null } }),
    ]);

    const formattedItems = items.map((lead) => {
      const resolved = resolveLeadContactName({
        phoneNumber: lead.phoneNumber,
        displayName: lead.displayName,
        waPushName: lead.waPushName,
        customerProfile: lead.customerProfile,
      });

      let parsedLabels: string[] = [];
      if (lead.labels) {
        try {
          parsedLabels = JSON.parse(lead.labels);
        } catch {
          parsedLabels = lead.labels.split(",").map((s) => s.trim()).filter(Boolean);
        }
      }

      return {
        ...lead,
        labels: parsedLabels,
        notesCount: lead._count?.notes || 0,
        resolvedContact: resolved,
      };
    });

    return {
      items: formattedItems,
      counts: {
        all: totalAll,
        me: totalMe,
        unassigned: totalUnassigned,
      },
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getLeadById(id: string) {
    const lead = await this.prisma.crmLead.findUnique({
      where: { id },
      include: {
        customerProfile: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            orders: {
              take: 5,
              orderBy: { createdAt: "desc" },
            },
          },
        },
        assignedToUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        sourceCode: true,
        whatsappClick: true,
        notes: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!lead) {
      throw new ApiError("Data lead tidak ditemukan", 404);
    }

    const resolved = resolveLeadContactName({
      phoneNumber: lead.phoneNumber,
      displayName: lead.displayName,
      waPushName: lead.waPushName,
      customerProfile: lead.customerProfile,
    });

    let parsedLabels: string[] = [];
    if (lead.labels) {
      try {
        parsedLabels = JSON.parse(lead.labels);
      } catch {
        parsedLabels = lead.labels.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }

    return {
      ...lead,
      labels: parsedLabels,
      resolvedContact: resolved,
    };
  }

  async searchCustomers(query: string) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const q = query.trim();

    const customers = await this.prisma.customerProfile.findMany({
      where: {
        OR: [
          { companyName: { contains: q } },
          { picName: { contains: q } },
          { phone: { contains: q } },
          { user: { name: { contains: q } } },
          { user: { email: { contains: q } } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            orders: true,
          },
        },
      },
      take: 15,
    });

    return customers.map((c) => ({
      id: c.id,
      accountType: c.accountType,
      companyName: c.companyName,
      picName: c.picName,
      phone: c.phone || c.picPhone,
      userName: c.user?.name,
      userEmail: c.user?.email,
      totalOrders: c._count.orders,
    }));
  }

  async updateName(leadId: string, displayName: string) {
    await this.getLeadById(leadId);

    const updated = await this.prisma.crmLead.update({
      where: { id: leadId },
      data: {
        displayName: displayName.trim(),
      },
    });

    return updated;
  }

  async linkCustomer(leadId: string, customerProfileId: string) {
    await this.getLeadById(leadId);

    const customer = await this.prisma.customerProfile.findUnique({
      where: { id: customerProfileId },
    });

    if (!customer) {
      throw new ApiError("Profil customer tidak ditemukan", 404);
    }

    const updated = await this.prisma.crmLead.update({
      where: { id: leadId },
      data: {
        customerProfileId,
      },
      include: {
        customerProfile: {
          include: {
            user: true,
          },
        },
      },
    });

    return updated;
  }

  async unlinkCustomer(leadId: string) {
    await this.getLeadById(leadId);

    const updated = await this.prisma.crmLead.update({
      where: { id: leadId },
      data: {
        customerProfileId: null,
      },
    });

    return updated;
  }

  async claimLead(leadId: string, userId: string) {
    await this.getLeadById(leadId);

    const updated = await this.prisma.crmLead.update({
      where: { id: leadId },
      data: {
        assignedToUserId: userId,
        assignmentMethod: CrmAssignMethod.CLAIM,
        assignedAt: new Date(),
        status: "IN_PROGRESS",
      },
      include: {
        assignedToUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return updated;
  }

  /**
   * Verifikasi PIN / Passcode Supervisor untuk Chat Lock Protection
   */
  async verifySupervisorPin(pin: string): Promise<boolean> {
    const cleanPin = (pin || "").trim();
    if (!cleanPin) return false;
    const correctPin = process.env.SUPERVISOR_PIN || "123456";
    return cleanPin === correctPin;
  }

  /**
   * Mengambil alih penugasan chat (Takeover) dengan otorisasi Supervisor
   */
  async takeoverLead(params: {
    leadId: string;
    userId: string;
    supervisorPin?: string;
    isSupervisorOrAdmin?: boolean;
  }) {
    const lead = await this.getLeadById(params.leadId);

    if (!params.isSupervisorOrAdmin) {
      if (!params.supervisorPin) {
        throw new ApiError(
          "Kode otorisasi supervisor diperlukan untuk mengambil alih chat yang sedang ditangani CS lain.",
          403
        );
      }
      const isValid = await this.verifySupervisorPin(params.supervisorPin);
      if (!isValid) {
        throw new ApiError("Kode supervisor salah. Pengalihan chat ditolak.", 401);
      }
    }

    const updated = await this.prisma.crmLead.update({
      where: { id: params.leadId },
      data: {
        assignedToUserId: params.userId,
        assignmentMethod: CrmAssignMethod.CLAIM,
        assignedAt: new Date(),
        status: lead.status === "NEW" ? "IN_PROGRESS" : lead.status,
      },
      include: {
        assignedToUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return updated;
  }

  async assignLead(leadId: string, assignedToUserId: string | null) {
    await this.getLeadById(leadId);

    const updated = await this.prisma.crmLead.update({
      where: { id: leadId },
      data: {
        assignedToUserId,
        assignmentMethod: assignedToUserId ? CrmAssignMethod.MANUAL : CrmAssignMethod.CLAIM,
        assignedAt: assignedToUserId ? new Date() : null,
      },
      include: {
        assignedToUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return updated;
  }

  async updateStatus(leadId: string, status: string) {
    await this.getLeadById(leadId);

    // Verifikasi apakah key status terdaftar di crm_lead_status_configs
    const statusExists = await this.prisma.crmLeadStatusConfig.findUnique({
      where: { key: status },
    });
    if (!statusExists) {
      throw new ApiError(`Status "${status}" tidak terdaftar`, 400);
    }

    const updated = await this.prisma.crmLead.update({
      where: { id: leadId },
      data: { status },
      include: {
        statusConfig: true,
      },
    });

    return updated;
  }

  async updateLabels(leadId: string, labels: string[]) {
    await this.getLeadById(leadId);

    const cleanLabels = Array.isArray(labels)
      ? labels.map((l) => l.trim()).filter(Boolean)
      : [];

    const updated = await this.prisma.crmLead.update({
      where: { id: leadId },
      data: {
        labels: JSON.stringify(cleanLabels),
      },
    });

    // Auto-upsert label baru ke database konfigurasi label CRM
    for (const labelName of cleanLabels) {
      try {
        const existing = await this.prisma.crmLeadLabelConfig.findFirst({
          where: { name: labelName },
        });
        if (!existing) {
          const maxOrder = await this.prisma.crmLeadLabelConfig.aggregate({
            _max: { orderIndex: true },
          });
          await this.prisma.crmLeadLabelConfig.create({
            data: {
              name: labelName,
              color: "#059669",
              orderIndex: (maxOrder._max.orderIndex || 0) + 1,
            },
          });
        }
      } catch {
        // Abaikan jika sudah ada / race condition
      }
    }

    return {
      ...updated,
      labels: cleanLabels,
    };
  }

  async getNotes(leadId: string) {
    return this.prisma.crmLeadNote.findMany({
      where: { leadId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async addNote(leadId: string, userId: string, content: string) {
    if (!content || !content.trim()) {
      throw new ApiError("Isi catatan tidak boleh kosong", 400);
    }
    await this.getLeadById(leadId);

    const note = await this.prisma.crmLeadNote.create({
      data: {
        leadId,
        userId,
        content: content.trim(),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return note;
  }

  async deleteNote(leadId: string, noteId: string) {
    const note = await this.prisma.crmLeadNote.findUnique({
      where: { id: noteId },
    });
    if (!note || note.leadId !== leadId) {
      throw new ApiError("Catatan tidak ditemukan", 404);
    }

    await this.prisma.crmLeadNote.delete({
      where: { id: noteId },
    });

    return { success: true };
  }

  async getCsUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" },
      take: 100,
    });
  }

  /**
   * Mengklasifikasikan isi pesan WhatsApp secara otomatis ke dalam label/kategori cerdas
   */
  classifyMessageContent(text?: string | null, existingLabels: string[] = []): string[] {
    if (!text || typeof text !== "string") {
      return [...existingLabels];
    }

    const labelsSet = new Set(existingLabels.map((l) => l.trim()).filter(Boolean));

    for (const rule of CRM_CLASSIFICATION_RULES) {
      if (rule.keywords.test(text)) {
        labelsSet.add(rule.label);
      }
    }

    return Array.from(labelsSet);
  }

  /**
   * Memastikan label yang dihasilkan terdaftar di konfigurasi CRM
   */
  async ensureLabelsConfig(labelNames: string[]): Promise<void> {
    if (!this.prisma.crmLeadLabelConfig) return;
    for (const name of labelNames) {
      try {
        const rule = CRM_CLASSIFICATION_RULES.find((r) => r.label === name);
        const existing = await this.prisma.crmLeadLabelConfig.findFirst({
          where: { name },
        });
        if (!existing) {
          const maxOrder = await this.prisma.crmLeadLabelConfig.aggregate({
            _max: { orderIndex: true },
          });
          await this.prisma.crmLeadLabelConfig.create({
            data: {
              name,
              color: rule?.color || "#059669",
              orderIndex: (maxOrder._max.orderIndex || 0) + 1,
            },
          });
        }
      } catch {
        // Abaikan race condition
      }
    }
  }

  /**
   * Menjalankan auto-klasifikasi pada seluruh data lead yang memiliki riwayat percakapan
   */
  async autoClassifyAllLeads(): Promise<{ total: number; updated: number }> {
    const leads = await this.prisma.crmLead.findMany({
      where: {
        lastMessage: { not: null },
      },
      select: {
        id: true,
        lastMessage: true,
        labels: true,
      },
    });

    let updatedCount = 0;
    for (const lead of leads) {
      if (!lead.lastMessage) continue;
      let existing: string[] = [];
      if (lead.labels) {
        try {
          existing = JSON.parse(lead.labels);
        } catch {
          existing = lead.labels.split(",").map((s) => s.trim()).filter(Boolean);
        }
      }

      const classified = this.classifyMessageContent(lead.lastMessage, existing);
      if (classified.length > existing.length) {
        await this.prisma.crmLead.update({
          where: { id: lead.id },
          data: { labels: JSON.stringify(classified) },
        });
        await this.ensureLabelsConfig(classified);
        updatedCount++;
      }
    }

    return { total: leads.length, updated: updatedCount };
  }

  /**
   * Menautkan kode atribusi (GK-XXXXX atau [REF:XXX]) ke Lead secara langsung / on-demand
   */
  async attachCode(leadId: string, codeOrText: string) {
    const lead = await this.prisma.crmLead.findUnique({
      where: { id: leadId },
    });
    if (!lead) {
      throw new ApiError("Lead tidak ditemukan", 404);
    }

    const text = (codeOrText || "").trim();
    if (!text) {
      throw new ApiError("Kode tidak boleh kosong", 400);
    }

    const staticMatch = text.match(/(?:\[\s*)?(?:REF|CODE)\s*:\s*([A-Za-z0-9_-]+)(?:\s*\])?/i);
    const dynamicMatch =
      text.match(/(?:Kode\s*(?:WA)?|Code|Ref)?\s*:?\s*(GK-[A-Za-z0-9_-]{3,12})/i) ||
      text.match(/\b(GK-[A-Za-z0-9_-]{3,12})\b/i);

    const candidateCode = staticMatch ? staticMatch[1].toUpperCase() : null;
    let candidateClickCode = dynamicMatch ? dynamicMatch[1].toUpperCase() : null;
    if (!candidateClickCode && text.toUpperCase().startsWith("GK-")) {
      candidateClickCode = text.toUpperCase();
    }

    let matchedSourceCode: any = null;
    let matchedWhatsappClick: any = null;

    if (candidateCode) {
      matchedSourceCode = await this.prisma.crmCustomCode.findUnique({
        where: { code: candidateCode },
      });
    }

    const clickCodeToLook = candidateClickCode || (matchedSourceCode ? null : candidateCode);
    if (clickCodeToLook) {
      matchedWhatsappClick = await this.prisma.whatsappClick.findUnique({
        where: { code: clickCodeToLook },
      });
      if (matchedWhatsappClick) {
        await this.prisma.whatsappClick.update({
          where: { id: matchedWhatsappClick.id },
          data: { matchedAt: new Date() },
        }).catch(() => {});
      } else if (clickCodeToLook.startsWith("GK-")) {
        // Auto-create fallback WhatsappClick record if not exists so lead is never lost
        try {
          matchedWhatsappClick = await this.prisma.whatsappClick.create({
            data: {
              code: clickCodeToLook,
              pagePath: "/ (Terdeteksi dari Riwayat Chat WA)",
              ctaName: "WhatsApp Button",
              attribution: {
                platform: "Website",
                source: "whatsapp_message_history",
                note: "Dibuat otomatis dari kode GK yang terdeteksi di pesan WhatsApp",
              },
              matchedAt: new Date(),
            },
          });
        } catch {
          matchedWhatsappClick = await this.prisma.whatsappClick.findUnique({
            where: { code: clickCodeToLook },
          });
        }
      }
    }

    if (!matchedSourceCode && !matchedWhatsappClick) {
      throw new ApiError(`Kode '${text}' tidak ditemukan di database Master Kode atau Web Click.`, 404);
    }

    // Parsing label yang ada dan jalankan auto-classifier pada teks
    let existingLabels: string[] = [];
    if (lead.labels) {
      try {
        existingLabels = JSON.parse(lead.labels);
      } catch {
        existingLabels = lead.labels.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    const classifiedLabels = this.classifyMessageContent(text, existingLabels);
    const hasLabelChanges = classifiedLabels.length > existingLabels.length;

    if (classifiedLabels.length > 0) {
      this.ensureLabelsConfig(classifiedLabels).catch(() => {});
    }

    const updated = await this.prisma.crmLead.update({
      where: { id: leadId },
      data: {
        ...(matchedSourceCode && { sourceCodeId: matchedSourceCode.id }),
        ...(matchedWhatsappClick && { whatsappClickId: matchedWhatsappClick.id }),
        ...(hasLabelChanges && { labels: JSON.stringify(classifiedLabels) }),
      },
      include: {
        customerProfile: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        assignedToUser: {
          select: { id: true, name: true, email: true },
        },
        sourceCode: true,
        whatsappClick: true,
      },
    });

    return updated;
  }

  async createOrUpsertLead(params: {
    phoneNumber: string;
    waPushName?: string | null;
    rawMessageText?: string | null;
    lastMessage?: string | null;
    lastMessageAt?: Date | null;
    unreadCount?: number;
  }) {
    const cleanedPhone = this.normalizePhoneNumber(params.phoneNumber);
    if (!cleanedPhone || cleanedPhone.length < 5) {
      throw new ApiError("Nomor telepon tidak valid", 400);
    }

    // 1. Cek apakah pesan mengandung tag [REF:XXX], [CODE:XXX], atau Kode acak web client (GK-XXXXX)
    let matchedSourceCode: any = null;
    let matchedWhatsappClick: any = null;
    const textToCheck = params.rawMessageText || params.lastMessage;

    if (textToCheck) {
      // 1a. Cek format static custom code: [REF:XXX], [CODE:XXX], atau REF: XXX
      const staticMatch = textToCheck.match(/(?:\[\s*)?(?:REF|CODE)\s*:\s*([A-Za-z0-9_-]+)(?:\s*\])?/i);

      // 1b. Cek format dynamic web attribution: "Kode: GK-XXXXX" atau "Code: GK-XXXXX" atau pola GK-[A-Z0-9]{3,12}
      const dynamicMatch =
        textToCheck.match(/(?:Kode\s*(?:WA)?|Code|Ref)?\s*:?\s*(GK-[A-Za-z0-9_-]{3,12})/i) ||
        textToCheck.match(/\b(GK-[A-Za-z0-9_-]{3,12})\b/i);

      const candidateCode = staticMatch ? staticMatch[1].toUpperCase() : null;
      let candidateClickCode = dynamicMatch ? dynamicMatch[1].toUpperCase() : null;
      if (!candidateClickCode && textToCheck.toUpperCase().includes("GK-")) {
        const fallbackGk = textToCheck.match(/\b(GK-[A-Za-z0-9_-]{3,12})\b/i);
        if (fallbackGk) candidateClickCode = fallbackGk[1].toUpperCase();
      }

      // Prioritas 1: Cari di crmCustomCode (Master Kode)
      if (candidateCode) {
        matchedSourceCode = await this.prisma.crmCustomCode.findUnique({
          where: { code: candidateCode },
        });
      }

      // Prioritas 2: Cari di whatsapp_clicks (Dynamic Website Click)
      const clickCodeToLook = candidateClickCode || (matchedSourceCode ? null : candidateCode);
      if (clickCodeToLook) {
        matchedWhatsappClick = await this.prisma.whatsappClick.findUnique({
          where: { code: clickCodeToLook },
        });
        if (matchedWhatsappClick) {
          // Tandai bahwa klik ini sudah terhubung ke pesan WhatsApp
          await this.prisma.whatsappClick.update({
            where: { id: matchedWhatsappClick.id },
            data: { matchedAt: new Date() },
          }).catch(() => {});
        } else if (clickCodeToLook.startsWith("GK-")) {
          // Auto-create fallback WhatsappClick record if not exists
          try {
            matchedWhatsappClick = await this.prisma.whatsappClick.create({
              data: {
                code: clickCodeToLook,
                pagePath: "/ (Terdeteksi Otomatis dari Chat WA)",
                ctaName: "WhatsApp Button",
                attribution: {
                  platform: "Website",
                  source: "whatsapp_incoming_message",
                  note: "Dibuat otomatis dari kode GK yang terdeteksi di pesan WhatsApp",
                },
                matchedAt: new Date(),
              },
            });
          } catch {
            matchedWhatsappClick = await this.prisma.whatsappClick.findUnique({
              where: { code: clickCodeToLook },
            });
          }
        }
      }
    }

    // 2. Cek apakah nomor telepon sudah terdaftar di customer_profiles
    const existingCustomer = await this.prisma.customerProfile.findFirst({
      where: {
        OR: [
          { phone: cleanedPhone },
          { picPhone: cleanedPhone },
        ],
      },
    });

    // 3. Cek apakah lead sudah ada
    const existingLead = await this.prisma.crmLead.findUnique({
      where: { phoneNumber: cleanedPhone },
    });

    // Auto-klasifikasi label dari teks pesan
    let existingLabels: string[] = [];
    if (existingLead?.labels) {
      try {
        existingLabels = JSON.parse(existingLead.labels);
      } catch {
        existingLabels = existingLead.labels.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }

    const classifiedLabels = this.classifyMessageContent(textToCheck, existingLabels);
    const hasLabelChanges = classifiedLabels.length > existingLabels.length;

    if (classifiedLabels.length > 0) {
      this.ensureLabelsConfig(classifiedLabels).catch(() => {});
    }

    // Penugasan otomatis jika custom code adalah kode CS
    let assignedUserId: string | null = existingLead?.assignedToUserId || null;
    let assignmentMethod: CrmAssignMethod = existingLead?.assignmentMethod || CrmAssignMethod.CLAIM;
    let assignedAt: Date | null = existingLead?.assignedAt || null;

    if (!assignedUserId && matchedSourceCode && matchedSourceCode.type === "CS_AGENT_CODE" && matchedSourceCode.assignedUserId) {
      assignedUserId = matchedSourceCode.assignedUserId;
      assignmentMethod = CrmAssignMethod.MANUAL;
      assignedAt = new Date();
    }

    const lead = await this.prisma.crmLead.upsert({
      where: { phoneNumber: cleanedPhone },
      update: {
        ...(params.waPushName && { waPushName: params.waPushName }),
        ...(matchedSourceCode && { sourceCodeId: matchedSourceCode.id }),
        ...(matchedWhatsappClick && { whatsappClickId: matchedWhatsappClick.id }),
        ...(hasLabelChanges && { labels: JSON.stringify(classifiedLabels) }),
        ...(assignedUserId && !existingLead?.assignedToUserId && {
          assignedToUserId: assignedUserId,
          assignmentMethod: assignmentMethod,
          assignedAt: assignedAt,
        }),
        ...(params.lastMessage !== undefined && { lastMessage: params.lastMessage }),
        ...(params.lastMessageAt !== undefined && { lastMessageAt: params.lastMessageAt }),
        ...(params.unreadCount !== undefined && { unreadCount: params.unreadCount }),
        // Hubungkan ke customer profile jika belum terhubung
        ...(existingCustomer && !existingLead?.customerProfileId && {
          customerProfileId: existingCustomer.id,
        }),
      },
      create: {
        phoneNumber: cleanedPhone,
        waPushName: params.waPushName || null,
        customerProfileId: existingCustomer ? existingCustomer.id : null,
        sourceCodeId: matchedSourceCode ? matchedSourceCode.id : null,
        whatsappClickId: matchedWhatsappClick ? matchedWhatsappClick.id : null,
        labels: classifiedLabels.length > 0 ? JSON.stringify(classifiedLabels) : null,
        assignedToUserId: assignedUserId,
        assignmentMethod: assignmentMethod,
        assignedAt: assignedAt,
        status: "NEW",
        lastMessage: params.lastMessage || null,
        lastMessageAt: params.lastMessageAt || new Date(),
        unreadCount: params.unreadCount || 0,
      },
    });

    return lead;
  }

  /**
   * Batch processing chat items dari WAHA/Catha API
   */
  async batchSyncChats(
    chats: Array<{
      id: string;
      name?: string | null;
      phoneNumber?: string | null;
      isGroup?: boolean;
      unreadCount?: number;
      timestamp?: number;
      lastMessage?: {
        body?: string;
        timestamp?: number;
        fromMe?: boolean;
      } | null;
    }>
  ): Promise<SyncLeadResult> {
    const settings = await this.prisma.crmSetting.findUnique({
      where: { id: "default" },
    });

    const ignoreGroups = settings?.ignoreGroups ?? true;
    const ignoreBroadcasts = settings?.ignoreBroadcasts ?? true;
    const blacklist = (settings?.blacklistedNumbers || "")
      .split(/[\n,]+/)
      .map((s) => s.trim().replace(/\D/g, ""))
      .filter(Boolean);

    let createdCount = 0;
    let updatedCount = 0;
    let ignoredCount = 0;

    for (const chat of chats) {
      const isGroup = chat.isGroup || chat.id.includes("@g.us");
      const isBroadcast = chat.id.includes("@broadcast") || chat.id.includes("status@broadcast");

      if (ignoreGroups && isGroup) {
        ignoredCount++;
        continue;
      }

      if (ignoreBroadcasts && isBroadcast) {
        ignoredCount++;
        continue;
      }

      const rawPhone = chat.phoneNumber || chat.id;
      const cleaned = this.normalizePhoneNumber(rawPhone);

      if (!cleaned || cleaned.length < 5 || blacklist.includes(cleaned)) {
        ignoredCount++;
        continue;
      }

      const lastMsgText = chat.lastMessage?.body || null;
      const lastMsgTs = chat.lastMessage?.timestamp || chat.timestamp;
      const lastMsgAt = lastMsgTs ? new Date(lastMsgTs * 1000) : null;

      const existing = await this.prisma.crmLead.findUnique({
        where: { phoneNumber: cleaned },
        select: { id: true },
      });

      await this.createOrUpsertLead({
        phoneNumber: cleaned,
        waPushName: chat.name || null,
        rawMessageText: lastMsgText,
        lastMessage: lastMsgText,
        lastMessageAt: lastMsgAt,
        unreadCount: chat.unreadCount || 0,
      });

      if (existing) {
        updatedCount++;
      } else {
        createdCount++;
      }
    }

    return {
      totalChats: chats.length,
      synced: createdCount + updatedCount,
      created: createdCount,
      updated: updatedCount,
      ignored: ignoredCount,
    };
  }

  /**
   * Tarik chat langsung dari Catha WA API server berdasarkan sesi yang dikonfigurasi
   */
  async syncLeadsFromWa(targetSessionId?: string, limit: number = 50): Promise<SyncLeadResult> {
    const settings = await this.prisma.crmSetting.findUnique({
      where: { id: "default" },
    });

    const sessionId = targetSessionId || settings?.leadReceiverSessionId;
    if (!sessionId) {
      throw new ApiError(
        "Belum ada sesi WhatsApp yang dipilih sebagai penerima leads. Silakan atur di Pengaturan CRM terlebih dahulu.",
        400
      );
    }

    const baseUrl = process.env.WA_API_URL || "https://wa-api.goenakan.id";
    const apiKey = process.env.WA_API_KEY || "catha_secret_key_change_me";

    let chats: any[] = [];
    try {
      const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/chats?sessionId=${encodeURIComponent(sessionId)}&limit=${Math.max(1, Math.min(limit, 100))}`;
      const res = await fetch(url, {
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(60000), // 60 detik agar tidak timeout pada antrean chat besar
      });

      if (!res.ok) {
        throw new ApiError(`Gagal mengambil data dari WhatsApp API (${res.status} ${res.statusText})`, 502);
      }

      const json = await res.json();
      chats = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      if (err?.name === "TimeoutError" || err?.message?.toLowerCase().includes("timeout")) {
        throw new ApiError(
          "Waktu koneksi ke server WhatsApp habis (timeout 60 detik). Server WA sedang memproses data chat atau koneksi lambat. Silakan coba beberapa saat lagi.",
          504
        );
      }
      throw new ApiError(err.message || "Gagal menghubungi server WhatsApp", 502);
    }

    return this.batchSyncChats(chats);
  }

  /**
   * Pindai riwayat percakapan WhatsApp (Deep Scan) untuk seluruh lead yang belum tertaut dengan kode web (GK-).
   * Mengambil riwayat pesan dari server WhatsApp (WAHA / Catha) dan menautkan kode GK- / REF: jika ditemukan.
   */
  async scanHistoricalMessagesForAttribution(targetSessionId?: string, maxLeads: number = 50): Promise<{
    scannedLeads: number;
    matchedLeads: number;
    matchedDetails: Array<{ id: string; phoneNumber: string; code: string }>;
  }> {
    const settings = await this.prisma.crmSetting.findUnique({
      where: { id: "default" },
    });

    const sessionId = targetSessionId || settings?.leadReceiverSessionId;
    if (!sessionId) {
      throw new ApiError("Belum ada sesi WhatsApp yang dikonfigurasi.", 400);
    }

    // Ambil lead yang belum memiliki whatsappClickId dan belum memiliki sourceCodeId
    const unlinkedLeads = await this.prisma.crmLead.findMany({
      where: {
        whatsappClickId: null,
        sourceCodeId: null,
      },
      orderBy: { lastMessageAt: "desc" },
      take: Math.max(1, Math.min(maxLeads, 100)),
      select: { id: true, phoneNumber: true, displayName: true },
    });

    if (unlinkedLeads.length === 0) {
      return { scannedLeads: 0, matchedLeads: 0, matchedDetails: [] };
    }

    const baseUrl = process.env.WA_API_URL || "https://wa-api.goenakan.id";
    const apiKey = process.env.WA_API_KEY || "catha_secret_key_change_me";

    let matchedCount = 0;
    const matchedDetails: Array<{ id: string; phoneNumber: string; code: string }> = [];

    for (const lead of unlinkedLeads) {
      try {
        const chatId = `${this.normalizePhoneNumber(lead.phoneNumber)}@c.us`;
        const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/chats/${encodeURIComponent(chatId)}/messages?sessionId=${encodeURIComponent(sessionId)}&limit=50`;

        const res = await fetch(url, {
          headers: {
            "X-API-Key": apiKey,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) continue;

        const json = await res.json();
        const items = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];

        for (const msg of items) {
          const body = msg.body || msg.text || msg.caption || "";
          if (!body) continue;

          const dyn =
            body.match(/(?:Kode\s*(?:WA)?|Code|Ref)?\s*:?\s*(GK-[A-Za-z0-9_-]{3,12})/i) ||
            body.match(/\b(GK-[A-Za-z0-9_-]{3,12})\b/i);
          const stat = body.match(/(?:\[\s*)?(?:REF|CODE)\s*:\s*([A-Za-z0-9_-]+)(?:\s*\])?/i);

          const detected = dyn ? dyn[1].toUpperCase() : stat ? stat[1].toUpperCase() : null;

          if (detected) {
            await this.attachCode(lead.id, detected);
            matchedCount++;
            matchedDetails.push({
              id: lead.id,
              phoneNumber: lead.phoneNumber,
              code: detected,
            });
            break; // Lanjut ke lead berikutnya
          }
        }
      } catch {
        // Lanjutkan ke lead berikutnya jika ada kendala koneksi ke chat tertentu
      }
    }

    return {
      scannedLeads: unlinkedLeads.length,
      matchedLeads: matchedCount,
      matchedDetails,
    };
  }

  /**
   * Pemrosesan real-time incoming webhook event dari WAHA / Catha WA API
   * Event yang didukung: message, message.any, message.incoming, message.upsert
   */
  async processWebhookEvent(body: any): Promise<{
    handled: boolean;
    reason?: string;
    lead?: any;
  }> {
    if (!body || typeof body !== "object") {
      return { handled: false, reason: "Payload kosong atau bukan objek" };
    }

    const event = String(body.event || body.type || "");

    // Abaikan event status/ack yang bukan pesan (misal session.status, message.ack)
    if (event && !event.startsWith("message")) {
      return { handled: false, reason: `Event '${event}' diabaikan (hanya event pesan yang diproses)` };
    }

    // Normalisasi struktur pesan (WAHA membungkus di payload, Catha di data atau top-level)
    const msg = body.payload || body.data || body;
    if (!msg || typeof msg !== "object") {
      return { handled: false, reason: "Struktur data pesan tidak ditemukan dalam payload" };
    }

    const rawFrom = msg.from || msg.sender || msg.phoneNumber || body.from;
    if (!rawFrom) {
      return { handled: false, reason: "Nomor pengirim (from) tidak ditemukan dalam pesan" };
    }

    // Deteksi grup WhatsApp dan status/broadcast
    const isGroup = Boolean(msg.isGroup || String(rawFrom).includes("@g.us"));
    const isBroadcast = Boolean(String(rawFrom).includes("@broadcast") || String(rawFrom).includes("status@broadcast"));

    const settings = await this.prisma.crmSetting.findUnique({
      where: { id: "default" },
    });

    if ((settings?.ignoreGroups ?? true) && isGroup) {
      return { handled: false, reason: "Pesan grup diabaikan sesuai pengaturan CRM" };
    }

    if ((settings?.ignoreBroadcasts ?? true) && isBroadcast) {
      return { handled: false, reason: "Pesan broadcast diabaikan sesuai pengaturan CRM" };
    }

    // Normalisasi nomor telepon ke format standar (contoh: 628xxx)
    const cleanedPhone = this.normalizePhoneNumber(String(rawFrom));
    if (!cleanedPhone || cleanedPhone.length < 5) {
      return { handled: false, reason: `Nomor telepon tidak valid: ${rawFrom}` };
    }

    // Cek daftar nomor yang diblacklist
    const blacklist = (settings?.blacklistedNumbers || "")
      .split(/[\n,]+/)
      .map((s) => s.trim().replace(/\D/g, ""))
      .filter(Boolean);

    if (blacklist.includes(cleanedPhone)) {
      return { handled: false, reason: `Nomor ${cleanedPhone} ada dalam daftar blacklist CRM` };
    }

    const fromMe = Boolean(msg.fromMe);
    const messageText = msg.body || msg.text || msg.caption || null;
    const rawTimestamp = msg.timestamp || body.timestamp;
    const lastMessageAt = rawTimestamp
      ? new Date(typeof rawTimestamp === "number" && rawTimestamp < 10000000000 ? rawTimestamp * 1000 : rawTimestamp)
      : new Date();

    const pushName =
      msg._data?.notifyName ||
      msg.pushName ||
      msg.senderName ||
      msg.name ||
      body.pushName ||
      null;

    // Jika pesan dikirim oleh CS sendiri via WhatsApp Web/HP (fromMe: true)
    if (fromMe) {
      const existingLead = await this.prisma.crmLead.findUnique({
        where: { phoneNumber: cleanedPhone },
      });

      if (existingLead) {
        const updated = await this.prisma.crmLead.update({
          where: { id: existingLead.id },
          data: {
            lastMessage: messageText || existingLead.lastMessage,
            lastMessageAt,
            unreadCount: 0,
          },
        });
        return {
          handled: true,
          reason: "Pesan keluar dari CS diperbarui ke riwayat lead",
          lead: updated,
        };
      }

      return {
        handled: false,
        reason: "Pesan keluar dari kontak yang belum menjadi lead diabaikan",
      };
    }

    // Pesan masuk dari pelanggan (fromMe: false)
    const existingLead = await this.prisma.crmLead.findUnique({
      where: { phoneNumber: cleanedPhone },
      select: { id: true, unreadCount: true },
    });

    const currentUnread = (existingLead?.unreadCount || 0) + 1;

    const lead = await this.createOrUpsertLead({
      phoneNumber: cleanedPhone,
      waPushName: pushName,
      rawMessageText: messageText,
      lastMessage: messageText,
      lastMessageAt,
      unreadCount: currentUnread,
    });

    return {
      handled: true,
      reason: existingLead
        ? "Lead diperbarui otomatis via Real-Time Webhook"
        : "Lead baru tercatat otomatis via Real-Time Webhook",
      lead,
    };
  }
}
