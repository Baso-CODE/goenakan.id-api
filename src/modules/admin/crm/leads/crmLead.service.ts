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

    // 1. Cek apakah pesan mengandung tag [REF:XXX] atau [CODE:XXX]
    let matchedSourceCode: any = null;
    const textToCheck = params.rawMessageText || params.lastMessage;
    if (textToCheck) {
      const match = textToCheck.match(/\[(?:REF|CODE):([A-Za-z0-9_-]+)\]/i);
      if (match && match[1]) {
        matchedSourceCode = await this.prisma.crmCustomCode.findUnique({
          where: { code: match[1].toUpperCase() },
        });
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
  async syncLeadsFromWa(targetSessionId?: string): Promise<SyncLeadResult> {
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
      const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/chats?sessionId=${encodeURIComponent(sessionId)}&limit=100`;
      const res = await fetch(url, {
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        throw new ApiError(`Gagal mengambil data dari WhatsApp API (${res.status} ${res.statusText})`, 502);
      }

      const json = await res.json();
      chats = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || "Gagal menghubungi server WhatsApp", 502);
    }

    return this.batchSyncChats(chats);
  }
}
