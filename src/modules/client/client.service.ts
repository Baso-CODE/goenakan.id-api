import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { ClientType, CreateClientDTO } from "./dto/createClient.dto";
import { ClientListQueryDTO } from "./dto/queryExportClient.dto";
import { UpdateClientDTO } from "./dto/updateClient.dto";

@injectable()
export class ClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  // === CREATE CLIENT ===
  async createClient(data: CreateClientDTO) {
    const prefix = data.type === ClientType.B2B ? "B" : "C";

    // GET LAST CLIENT
    const lastClient = await this.prisma.client.findFirst({
      where: { type: data.type },
      orderBy: { createdAt: "desc" },
      select: { custCode: true },
    });

    let nextNumber = 1;
    if (lastClient?.custCode) {
      const match = lastClient.custCode.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    const custCode = `${prefix}${String(nextNumber).padStart(5, "0")}`;

    // ==================================================
    // ====================== B2B ========================
    // ==================================================
    if (data.type === ClientType.B2B) {
      return await this.prisma.client.create({
        data: {
          custCode,
          type: data.type,
          b2b: {
            create: {
              companyName: data.companyName!,
              departmentId: data.departmentId!,
              phone: data.phone ?? "",
              email: data.email ?? "",
              website: data.website ?? "",

              // ---- NEW ADDRESS FIELDS ----
              country: data.country ?? "",
              province: data.province ?? "",
              city: data.city ?? "",
              district: data.district ?? "",
              subDistrict: data.subDistrict ?? "",
              postalCode: data.postalCode ?? "",
              fullAddress: data.fullAddress ?? "",

              purchaseChannelId: data.purchaseChannelId!,

              // ---- MULTIPLE PIC ----
              pics: data.pics?.length
                ? {
                    create: data.pics.map((pic) => ({
                      prefix: pic.prefix ?? "",
                      name: pic.name ?? "",
                      email: pic.email ?? null,
                      phone: pic.phone ?? null,
                    })),
                  }
                : undefined,
            },
          },
        },
        include: {
          b2b: {
            include: { pics: true },
          },
        },
      });
    }

    // ==================================================
    // ====================== B2C ========================
    // ==================================================
    if (data.type === ClientType.B2C) {
      return await this.prisma.client.create({
        data: {
          custCode,
          type: data.type,
          b2c: {
            create: {
              prefix: data.prefix ?? "",
              name: data.name!,
              phone: data.phone ?? "",

              // ---- NEW ADDRESS FIELDS ----
              country: data.countryB2C ?? "",
              province: data.provinceB2C ?? "",
              city: data.cityB2C ?? "",
              district: data.districtB2C ?? "",
              subDistrict: data.subDistrictB2C ?? "",
              postalCode: data.postalCodeB2C ?? "",
              fullAddress: data.fullAddressB2C ?? data.fullAddress ?? "",

              purchaseChannelId:
                data.purchaseChannelIdB2C ?? data.purchaseChannelId!,
            },
          },
        },
        include: { b2c: true },
      });
    }

    throw new ApiError("Invalid client type", 400);
  }

  // === GET ALL CLIENTS ===
  async getAllClients(query: {
    page?: number;
    take?: number;
    type?: string;
    search?: string;
  }) {
    try {
      const { page = 1, take = 10, type, search } = query;
      const skip = (page - 1) * take;

      const where: any = {};

      // =======================
      // FILTER BY TYPE
      // =======================
      if (type && type !== "ALL") {
        where.type = type;
      }

      // =======================
      // SEARCH
      // =======================
      if (search) {
        const lowerSearch = search.toLowerCase();

        where.OR = [
          { custCode: { contains: lowerSearch } },

          // B2B Search
          {
            b2b: {
              is: {
                OR: [
                  { companyName: { contains: lowerSearch } },
                  { department: { name: { contains: lowerSearch } } },
                  {
                    pics: {
                      some: {
                        OR: [
                          { name: { contains: lowerSearch } },
                          { email: { contains: lowerSearch } },
                          { phone: { contains: lowerSearch } },
                        ],
                      },
                    },
                  },
                  { email: { contains: lowerSearch } },
                  { phone: { contains: lowerSearch } },
                  { city: { contains: lowerSearch } },
                ],
              },
            },
          },

          // B2C Search
          {
            b2c: {
              is: {
                OR: [
                  { name: { contains: lowerSearch } },
                  { phone: { contains: lowerSearch } },
                  { fullAddress: { contains: lowerSearch } },
                ],
              },
            },
          },
        ];
      }

      // =======================
      // COUNT
      // =======================
      const count = await this.prisma.client.count({ where });

      // =======================
      // FETCH CLIENTS
      // =======================
      const clients = await this.prisma.client.findMany({
        where,
        select: {
          id: true,
          custCode: true,
          type: true,
          createdAt: true,

          b2b: {
            select: {
              companyName: true,
              phone: true,
              email: true,
              city: true,
              department: {
                select: { name: true },
              },
              pics: {
                select: {
                  name: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },

          b2c: {
            select: {
              name: true,
              phone: true,
              fullAddress: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      });

      // =======================
      // FORMAT OUTPUT
      // =======================
      const formatted = clients.map((c) => {
        if (c.type === "B2B" && c.b2b) {
          const primaryPic = c.b2b.pics?.[0];

          return {
            id: c.id,
            custCode: c.custCode,
            type: c.type,
            createdAt: c.createdAt,
            companyName: c.b2b.companyName,
            department: c.b2b.department?.name ?? "-",
            picName: primaryPic?.name ?? "-",
            picEmail: primaryPic?.email ?? "-",
            picPhone: primaryPic?.phone ?? "-",
            email: c.b2b.email,
            phone: c.b2b.phone,
            city: c.b2b.city,
          };
        }

        if (c.type === "B2C" && c.b2c) {
          return {
            id: c.id,
            custCode: c.custCode,
            type: c.type,
            createdAt: c.createdAt,
            name: c.b2c.name,
            phone: c.b2c.phone,
            fullAddress: c.b2c.fullAddress,
          };
        }

        return {
          id: c.id,
          custCode: c.custCode,
          type: c.type,
          createdAt: c.createdAt,
          name: "-",
          phone: "-",
        };
      });

      // =======================
      // META PAGINATION
      // =======================
      const meta = this.pagination.generateMeta({
        page,
        take,
        count,
      });

      return {
        data: formatted,
        meta,
      };
    } catch (error) {
      console.error("❌ Error in getAllClients:", error);
      throw new Error("Failed to fetch clients. See server log for details.");
    }
  }

  // === GET CLIENT BY ID ===
  async getClientById(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        b2b: {
          include: {
            department: true,
            purchaseChannel: true,
            pics: true,
          },
        },
        b2c: {
          include: {
            purchaseChannel: true,
          },
        },
      },
    });

    if (!client) throw new ApiError("Client not found", 404);

    return client;
  }

  async updateClient(id: string, data: UpdateClientDTO) {
    const existing = await this.prisma.client.findUnique({
      where: { id },
      include: {
        b2b: { include: { pics: true } },
        b2c: true,
      },
    });

    if (!existing) throw new ApiError("Client not found", 404);

    // ====================================================
    // ======================= B2B ========================
    // ====================================================

    if (existing.type === ClientType.B2B) {
      return await this.prisma.client.update({
        where: { id },
        data: {
          b2b: {
            update: {
              companyName: data.companyName ?? existing.b2b?.companyName,
              departmentId: data.departmentId ?? existing.b2b?.departmentId,
              phone: data.phone ?? existing.b2b?.phone,
              email: data.email ?? existing.b2b?.email,
              website: data.website ?? existing.b2b?.website,

              country: data.country ?? existing.b2b?.country,
              province: data.province ?? existing.b2b?.province,
              city: data.city ?? existing.b2b?.city,
              district: data.district ?? existing.b2b?.district,
              subDistrict: data.subDistrict ?? existing.b2b?.subDistrict,
              postalCode: data.postalCode ?? existing.b2b?.postalCode,

              fullAddress: data.fullAddress ?? existing.b2b?.fullAddress,

              purchaseChannelId:
                data.purchaseChannelId ?? existing.b2b?.purchaseChannelId,

              pics: data.pics
                ? {
                    deleteMany: {},
                    create: data.pics.map((pic) => ({
                      prefix: pic.prefix ?? null,
                      name: pic.name ?? "",
                      email: pic.email ?? null,
                      phone: pic.phone ?? null,
                    })),
                  }
                : undefined,
            },
          },
        },
        include: {
          b2b: { include: { pics: true } },
        },
      });
    }

    // ====================================================
    // ======================= B2C ========================
    // ====================================================

    if (existing.type === ClientType.B2C) {
      return await this.prisma.client.update({
        where: { id },
        data: {
          b2c: {
            update: {
              prefix: data.prefix ?? existing.b2c?.prefix,
              name: data.name ?? existing.b2c?.name,
              phone: data.phone ?? existing.b2c?.phone,

              country: data.country ?? existing.b2c?.country,
              province: data.province ?? existing.b2c?.province,
              city: data.city ?? existing.b2c?.city,
              district: data.district ?? existing.b2c?.district,
              subDistrict: data.subDistrict ?? existing.b2c?.subDistrict,
              postalCode: data.postalCode ?? existing.b2c?.postalCode,

              fullAddress:
                data.fullAddressB2C ??
                data.fullAddress ??
                existing.b2c?.fullAddress,

              purchaseChannelId:
                data.purchaseChannelId ?? existing.b2c?.purchaseChannelId,
            },
          },
        },
        include: { b2c: true },
      });
    }

    throw new ApiError("Invalid client type", 400);
  }

  // === DELETE CLIENT ===
  async deleteClient(id: string) {
    const existing = await this.prisma.client.findUnique({
      where: { id },
      include: { b2b: true, b2c: true },
    });
    if (!existing) throw new ApiError("Client not found", 404);

    // Cek apakah client punya order/invoice/quotation
    const hasRelatedData = await this.prisma.order.findFirst({
      where: { clientId: id },
    });
    if (hasRelatedData) {
      throw new ApiError(
        "Client tidak dapat dihapus karena sudah memiliki data order terkait",
        400,
      );
    }

    // Hapus dalam urutan yang benar (child dulu, parent belakangan)
    await this.prisma.$transaction(async (tx) => {
      if (existing.b2b) {
        // Hapus PICs dulu
        await tx.clientB2BPIC.deleteMany({ where: { clientB2BId: id } });
        await tx.clientB2B.delete({ where: { id } });
      }
      if (existing.b2c) {
        await tx.clientB2C.delete({ where: { id } });
      }
      await tx.client.delete({ where: { id } });
    });

    return { message: "Client deleted successfully" };
  }

  // === GET ALL CLIENTS FOR ORDER (tanpa pagination) ===
  // async getAllClientsForOrder() {
  //   try {
  //     const clients = await this.prisma.client.findMany({
  //       select: {
  //         id: true,
  //         type: true,
  //         b2b: {
  //           select: {
  //             companyName: true,
  //             pics: true,
  //           },
  //         },
  //         b2c: {
  //           select: {
  //             name: true,
  //             phone: true,
  //           },
  //         },
  //       },
  //       orderBy: { createdAt: "desc" },
  //     });

  //     const formatted = clients.map((c) => {
  //       if (c.type === "B2B" && c.b2b) {
  //         const primaryPic = c.b2b.pics?.[0];

  //         return {
  //           id: c.id,
  //           type: c.type,
  //           name: primaryPic
  //             ? `${c.b2b.companyName} - PIC: ${primaryPic.name}`
  //             : c.b2b.companyName,
  //         };
  //       }

  //       if (c.type === "B2C" && c.b2c) {
  //         return {
  //           id: c.id,
  //           type: c.type,
  //           name: `${c.b2c.name} (${c.b2c.phone})`,
  //         };
  //       }

  //       return {
  //         id: c.id,
  //         type: c.type,
  //         name: "Unknown",
  //       };
  //     });

  //     return formatted;
  //   } catch (error) {
  //     console.error("❌ Error in getAllClientsForOrder:", error);
  //     throw new Error("Failed to fetch clients for order.");
  //   }
  // }
  // client.service.ts

  async getAllClientsForOrder() {
    const clients = await this.prisma.client.findMany({
      include: {
        b2b: {
          include: {
            pics: true,
          },
        },
        b2c: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return clients.map((client) => {
      const isB2B = client.type === "B2B" && client.b2b;
      const isB2C = client.type === "B2C" && client.b2c;

      let name = "";
      let phone = "";
      let address = "";
      let city = "";
      let pics: any[] = [];

      // 1. TAMBAHKAN VARIABLE INI
      let purchaseChannelId = "";

      if (isB2B && client.b2b) {
        name = client.b2b.companyName;
        phone = client.b2b.phone || "";
        address = client.b2b.fullAddress;
        city = client.b2b.city || "";

        // 2. AMBIL ID DARI B2B
        purchaseChannelId = client.b2b.purchaseChannelId;

        if (client.b2b.pics && client.b2b.pics.length > 0) {
          pics = client.b2b.pics.map((p) => ({
            id: p.id,
            name: p.name,
            phone: p.phone,
            email: p.email,
            prefix: p.prefix,
          }));
        }
      } else if (isB2C && client.b2c) {
        name = `${client.b2c.prefix ? client.b2c.prefix + ". " : ""}${
          client.b2c.name
        }`;
        phone = client.b2c.phone || "";
        address = client.b2c.fullAddress;
        city = client.b2c.city || "";

        // 3. AMBIL ID DARI B2C
        purchaseChannelId = client.b2c.purchaseChannelId;
      }

      const formattedAddress = city ? `${address}, ${city}` : address;

      return {
        id: client.id,
        custCode: client.custCode,
        type: client.type,
        name: name,
        phone: phone,
        address: formattedAddress,
        originalAddress: address,
        pics: pics,
        purchaseChannelId: purchaseChannelId,
      };
    });
  }

  async exportClientsToExcel(query: ClientListQueryDTO): Promise<Buffer> {
    // Re-use logic WHERE dari getClientList
    const where: any = {};

    if (query.type && query.type !== "ALL") {
      where.type = query.type as ClientType;
    }
    if (query.search) {
      const search = query.search.toLowerCase();
      where.OR = [
        { custCode: { contains: search, mode: "insensitive" } },
        { b2b: { companyName: { contains: search, mode: "insensitive" } } },
        { b2c: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setDate(end.getDate() + 1);
        where.createdAt.lt = end;
      }
    }

    // Ambil semua data (tanpa pagination)
    const clients = await this.prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        b2b: {
          include: { department: true, purchaseChannel: true, pics: true },
        },
        b2c: { include: { purchaseChannel: true } },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Klien");

    // Menentukan Kolom
    worksheet.columns = [
      { header: "Kode Klien", key: "custCode", width: 15 },
      { header: "Tipe", key: "type", width: 10 },
      { header: "Nama Klien", key: "name", width: 40 },
      { header: "Departemen/Prefix", key: "extraInfo1", width: 25 },
      { header: "Telepon Utama", key: "phone", width: 20 },
      { header: "Email/Website", key: "extraInfo2", width: 30 },
      { header: "Saluran Pembelian", key: "channel", width: 25 },
      { header: "Alamat Lengkap", key: "address", width: 60 },
      { header: "PIC B2B (Jika Ada)", key: "pics", width: 50 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 20 },
    ];

    // Menambahkan Data Baris
    clients.forEach((client) => {
      let clientData: any = {
        custCode: client.custCode,
        type: client.type,
        createdAt: client.createdAt.toLocaleString("id-ID"),
      };

      if (client.type === ClientType.B2B && client.b2b) {
        clientData.name = client.b2b.companyName;
        clientData.extraInfo1 = client.b2b.department?.name || "N/A";
        clientData.phone = client.b2b.phone || "N/A";
        clientData.extraInfo2 = client.b2b.email || client.b2b.website || "N/A";
        clientData.channel = client.b2b.purchaseChannel.name;
        clientData.address = `${client.b2b.fullAddress}, ${client.b2b.city}, ${client.b2b.province}`;
        clientData.pics =
          client.b2b.pics.map((p) => `${p.name} (${p.phone})`).join("; ") ||
          "None";
      } else if (client.type === ClientType.B2C && client.b2c) {
        clientData.name = client.b2c.name;
        clientData.extraInfo1 = client.b2c.prefix || "N/A";
        clientData.phone = client.b2c.phone || "N/A";
        clientData.extraInfo2 = "N/A"; // B2C tidak punya email/website di model ini
        clientData.channel = client.b2c.purchaseChannel.name;
        clientData.address = `${client.b2c.fullAddress}, ${client.b2c.city}, ${client.b2c.province}`;
        clientData.pics = "N/A"; // B2C tidak punya PIC terpisah
      } else {
        // Fallback
        clientData.name = "Data Missing";
      }

      worksheet.addRow(clientData);
    });

    // Styling Header (Opsional, gunakan warna biru untuk Client)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "0078D4" }, // Warna biru untuk Client
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
