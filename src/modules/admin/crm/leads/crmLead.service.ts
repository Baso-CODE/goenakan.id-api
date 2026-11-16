import { CrmAssignMethod, CrmLeadStatus } from "@prisma/client";
import { injectable, singleton } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { PrismaService } from "../../../prisma/prisma.service";
import { resolveLeadContactName } from "../helpers/contactNameResolver";

@singleton()
@injectable()
export class CrmLeadService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeads(params: {
    status?: CrmLeadStatus;
    assignedTo?: string; // 'me', 'unassigned', or specific userId
    currentUserId?: string;
    search?: string;
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

    if (params.assignedTo === "unassigned") {
      where.assignedToUserId = null;
    } else if (params.assignedTo === "me" && params.currentUserId) {
      where.assignedToUserId = params.currentUserId;
    } else if (params.assignedTo && params.assignedTo !== "all") {
      where.assignedToUserId = params.assignedTo;
    }

    if (params.search && params.search.trim().length > 0) {
      const q = params.search.trim();
      where.OR = [
        { phoneNumber: { contains: q } },
        { displayName: { contains: q } },
        { waPushName: { contains: q } },
        { customerProfile: { companyName: { contains: q } } },
        { customerProfile: { picName: { contains: q } } },
        { customerProfile: { user: { name: { contains: q } } } },
      ];
    }

    const [total, items] = await Promise.all([
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
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const formattedItems = items.map((lead) => {
      const resolved = resolveLeadContactName({
        phoneNumber: lead.phoneNumber,
        displayName: lead.displayName,
        waPushName: lead.waPushName,
        customerProfile: lead.customerProfile,
      });

      return {
        ...lead,
        resolvedContact: resolved,
      };
    });

    return {
      items: formattedItems,
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

    return {
      ...lead,
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

  async createOrUpsertLead(params: {
    phoneNumber: string;
    waPushName?: string | null;
    rawMessageText?: string | null;
  }) {
    const cleanedPhone = params.phoneNumber.replace(/\D/g, "");

    // Cek apakah pesan pertama mengandung tag [REF:XXX]
    let matchedSourceCodeId: string | null = null;
    if (params.rawMessageText) {
      const match = params.rawMessageText.match(/\[REF:([A-Za-z0-9_-]+)\]/i);
      if (match && match[1]) {
        const found = await this.prisma.crmCustomCode.findUnique({
          where: { code: match[1].toUpperCase() },
        });
        if (found) {
          matchedSourceCodeId = found.id;
        }
      }
    }

    // Cek apakah nomor telepon sudah terdaftar di customer_profiles
    const existingCustomer = await this.prisma.customerProfile.findFirst({
      where: {
        OR: [
          { phone: cleanedPhone },
          { picPhone: cleanedPhone },
        ],
      },
    });

    const lead = await this.prisma.crmLead.upsert({
      where: { phoneNumber: cleanedPhone },
      update: {
        waPushName: params.waPushName || undefined,
        sourceCodeId: matchedSourceCodeId || undefined,
      },
      create: {
        phoneNumber: cleanedPhone,
        waPushName: params.waPushName || null,
        customerProfileId: existingCustomer ? existingCustomer.id : null,
        sourceCodeId: matchedSourceCodeId,
        status: CrmLeadStatus.NEW,
        assignmentMethod: CrmAssignMethod.CLAIM,
      },
    });

    return lead;
  }
}
