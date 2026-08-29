import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { CounterService } from "../../../utils/counter.service";
import { SlugService } from "../../../utils/genereateSlug";
import { CloudinaryService } from "../../cloudinary/cloudinary.service";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ClientType, CreateClientDTO } from "./dto/createClient.dto";
import { ClientListQueryDTO } from "./dto/queryExportClient.dto";
import { UpdateClientDTO } from "./dto/updateClient.dto";

@injectable()
export class ClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly cloudinary: CloudinaryService,
    private readonly slugService: SlugService,
    private readonly counterService: CounterService,
  ) {}

  // === CREATE CLIENT ===
  async createClient(data: CreateClientDTO, logoFile?: Express.Multer.File) {
    try {
      const clientType = String(data.type).trim().toUpperCase();

      // 1. Validasi Awal: Lempar ApiError 400 jika tipe salah
      if (clientType !== "B2B" && clientType !== "B2C") {
        throw new ApiError(`Invalid client type: received ${data.type}`, 400);
      }

      const clientStatus =
        data.status === "POTENTIAL" ? "POTENTIAL" : "OFFICIAL";
      const parsedJoinedDate = data.joinedDate
        ? new Date(data.joinedDate)
        : undefined;

      // ==================================================
      // 2. PROSES UPLOAD FILE
      // ==================================================
      let brandCreateInput: any = undefined;

      if (clientType === "B2B" && data.brandName && logoFile) {
        // Jika upload gagal, akan masuk ke blok catch di bawah
        const uploadResult = await this.cloudinary.upload(logoFile, {
          folder: "brand-clients",
          resource_type: "image",
        });

        brandCreateInput = {
          create: {
            name: data.brandName,
            slug: this.slugService.create(data.brandName),
            country: data.brandCountry || data.country || "Indonesia",
            websiteUrl: data.brandWebsiteUrl || data.website || null,
            logo: uploadResult.secure_url,
            logoId: uploadResult.public_id,
            isActive: clientStatus === "OFFICIAL",
          },
        };
      }

      // ==================================================
      // 3. DATABASE TRANSACTION
      // ==================================================
      return await this.prisma.$transaction(async (tx) => {
        let prefix = "";
        let counterType = "";

        if (clientStatus === "POTENTIAL") {
          prefix = clientType === "B2B" ? "PBB" : "PBC";
          counterType =
            clientType === "B2B" ? "CLIENT_B2B_POT" : "CLIENT_B2C_POT";
        } else {
          prefix = clientType === "B2B" ? "B" : "C";
          counterType =
            clientType === "B2B" ? "CLIENT_B2B_OFF" : "CLIENT_B2C_OFF";
        }

        // Generate nomor aman dengan CounterService
        const sequence = await this.counterService.getNextFormattedNumber(
          tx,
          counterType,
          "",
          5,
        );

        const custCode = `${prefix}${sequence}`;

        // ====================== B2B ========================
        if (clientType === "B2B") {
          return await tx.client.create({
            data: {
              custCode,
              type: data.type,
              status: clientStatus,
              joinedDate: parsedJoinedDate,
              b2b: {
                create: {
                  companyName: data.companyName!,
                  departmentId: data.departmentId!,
                  phone: data.phone ?? "",
                  email: data.email ?? "",
                  website: data.website ?? "",

                  country: data.country ?? "",
                  province: data.province ?? "",
                  city: data.city ?? "",
                  district: data.district ?? "",
                  subDistrict: data.subDistrict ?? "",
                  postalCode: data.postalCode ?? "",
                  fullAddress: data.fullAddress ?? "",

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

                  brandClients: brandCreateInput,
                },
              },
            },
            include: {
              b2b: { include: { pics: true, brandClients: true } },
            },
          });
        }

        // ====================== B2C ========================
        if (clientType === "B2C") {
          return await tx.client.create({
            data: {
              custCode,
              type: data.type,
              status: clientStatus,
              b2c: {
                create: {
                  prefix: data.prefix ?? "",
                  name: data.name!,
                  phone: data.phone ?? "",

                  country: data.countryB2C ?? "",
                  province: data.provinceB2C ?? "",
                  city: data.cityB2C ?? "",
                  district: data.districtB2C ?? "",
                  subDistrict: data.subDistrictB2C ?? "",
                  postalCode: data.postalCodeB2C ?? "",
                  fullAddress: data.fullAddressB2C ?? data.fullAddress ?? "",
                },
              },
            },
            include: { b2c: true },
          });
        }

        // Fallback pengaman di dalam transaksi (seharusnya tidak akan pernah tersentuh)
        throw new ApiError("Failed to create client within transaction", 500);
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      console.error("❌ Terjadi kesalahan pada createClient:", error);

      throw new ApiError(
        "Terjadi kesalahan pada server saat menyimpan data klien",
        500,
      );
    }
  }

  // === UPDATE CLIENT (DENGAN LOGGING ERROR UPLOAD) ===
  async updateClient(
    id: string,
    data: UpdateClientDTO,
    logoFile?: Express.Multer.File,
  ) {
    console.log("📥 [UPDATE CLIENT] Menerima data request untuk ID:", id);
    console.log("📥 [UPDATE CLIENT] Data body:", JSON.stringify(data, null, 2));

    if (logoFile) {
      console.log("📸 [UPDATE CLIENT] File logo terdeteksi:", {
        originalname: logoFile.originalname,
        mimetype: logoFile.mimetype,
        size: logoFile.size,
      });
    } else {
      console.log("ℹ️ [UPDATE CLIENT] Tidak ada file logo baru yang diunggah.");
    }

    const existing = await this.prisma.client.findUnique({
      where: { id },
      include: {
        b2b: { include: { pics: true, brandClients: true } },
        b2c: true,
      },
    });

    if (!existing) {
      console.error(
        "❌ [UPDATE CLIENT] Klien dengan ID tersebut tidak ditemukan.",
      );
      throw new ApiError("Client not found", 404);
    }

    const parsedJoinedDate = data.joinedDate
      ? new Date(data.joinedDate)
      : undefined;

    // ====================================================
    // ======================= B2B ========================
    // ====================================================

    if (existing.type === ClientType.B2B) {
      let newLogoUrl: string | undefined = undefined;
      let newLogoId: string | undefined = undefined;

      if (logoFile) {
        try {
          console.log(
            "🚀 [CLOUDINARY] Memulai proses upload logo ke Cloudinary...",
          );
          const uploadResult = await this.cloudinary.upload(logoFile, {
            folder: "brand-clients",
            resource_type: "image",
          });

          newLogoUrl = uploadResult.secure_url;
          newLogoId = uploadResult.public_id;
          console.log("✅ [CLOUDINARY] Upload berhasil! URL:", newLogoUrl);
        } catch (uploadErr: any) {
          //  Tangkap dan cetak error mentah dari Cloudinary ke konsol backend
          console.error("🔥 [CLOUDINARY ERROR ASLI]:", uploadErr);
          throw new ApiError(
            `Gagal mengunggah logo ke Cloudinary: ${uploadErr?.message || "Unknown error"}`,
            500,
          );
        }
      }

      // Logika Brand yang lebih aman
      let brandOperation: any = undefined;
      const existingBrand = existing.b2b?.brandClients?.[0];

      if (
        data.brandName ||
        data.brandCountry ||
        data.brandWebsiteUrl ||
        logoFile
      ) {
        const brandData = {
          name: data.brandName ?? existingBrand?.name ?? "Default Brand",
          slug: data.brandName
            ? this.slugService.create(data.brandName)
            : (existingBrand?.slug ?? `brand-${Date.now()}`),
          country:
            data.brandCountry ??
            existingBrand?.country ??
            data.country ??
            "Indonesia",
          websiteUrl:
            data.brandWebsiteUrl ??
            existingBrand?.websiteUrl ??
            data.website ??
            null,
          logo: newLogoUrl ?? existingBrand?.logo,
          logoId: newLogoId ?? existingBrand?.logoId,
          isActive: existing.status === "OFFICIAL",
        };

        if (existingBrand) {
          brandOperation = {
            update: {
              where: { id: existingBrand.id },
              data: brandData,
            },
          };
        } else {
          brandOperation = {
            create: brandData,
          };
        }
      }

      console.log("💾 [PRISMA] Menyimpan pembaruan data B2B ke database...");
      const updatedClient = await this.prisma.client.update({
        where: { id },
        data: {
          joinedDate: parsedJoinedDate ?? existing.joinedDate,
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

              pics: Array.isArray(data.pics)
                ? {
                    deleteMany: {},
                    create: data.pics.map((pic: any) => ({
                      prefix: pic.prefix ?? "",
                      name: pic.name ?? "",
                      email: pic.email ?? null,
                      phone: pic.phone ?? null,
                    })),
                  }
                : undefined,

              brandClients: brandOperation,
            },
          },
        },
        include: {
          b2b: { include: { pics: true, brandClients: true } },
        },
      });

      console.log("🎉 [UPDATE CLIENT] Data B2B berhasil diperbarui!");
      return updatedClient;
    }

    // ====================================================
    // ======================= B2C ========================
    // ====================================================

    if (existing.type === ClientType.B2C) {
      console.log("💾 [PRISMA] Menyimpan pembaruan data B2C ke database...");
      return await this.prisma.client.update({
        where: { id },
        data: {
          joinedDate: parsedJoinedDate ?? existing.joinedDate,
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
    status?: string;
    search?: string;
  }) {
    try {
      const { page = 1, take = 10, type, status, search } = query;
      const skip = (page - 1) * take;

      const where: any = {};

      // =======================
      // FILTER BY TYPE
      // =======================
      if (type && type !== "ALL") {
        where.type = type;
      }

      // =======================
      // FILTER BY STATUS
      // =======================
      if (status && status !== "ALL") {
        where.status = status;
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
          status: true,
          joinedDate: true,
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
            status: c.status,
            joinedDate: c.joinedDate,
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
            status: c.status,
            joinedDate: c.joinedDate,
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
          joinedDate: c.joinedDate,
          status: c.status,
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
            pics: true,
            brandClients: true,
          },
        },
        b2c: {
          include: {},
        },
      },
    });

    if (!client) throw new ApiError("Client not found", 404);

    return client;
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
          include: { department: true, pics: true },
        },
        b2c: { include: {} },
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
        clientData.address = `${client.b2b.fullAddress}, ${client.b2b.city}, ${client.b2b.province}`;
        clientData.pics =
          client.b2b.pics.map((p) => `${p.name} (${p.phone})`).join("; ") ||
          "None";
      } else if (client.type === ClientType.B2C && client.b2c) {
        clientData.name = client.b2c.name;
        clientData.extraInfo1 = client.b2c.prefix || "N/A";
        clientData.phone = client.b2c.phone || "N/A";
        clientData.extraInfo2 = "N/A"; // B2C tidak punya email/website di model ini
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
