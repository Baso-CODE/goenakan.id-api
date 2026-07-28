import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";

import { ApiError } from "../../utils/api-error";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFollowUpDTO } from "./dto/follow-up.dto";
import { CreateQuotationDTO, UpdateQuotationDTO } from "./dto/quotation.dto";

@injectable()
export class QuotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // Helper: Konversi Bulan ke Romawi
  private getRomanMonth(date: Date): string {
    const months = [
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
      "XI",
      "XII",
    ];
    return months[date.getMonth()];
  }
  // ==========================================
  // 1. GET ALL (PAGINATION & SEARCH)
  // ==========================================
  async getAllQuotations(query: {
    page?: number;
    take?: number;
    search?: string;
    status?: string;
  }) {
    const page = Number(query.page) || 1;
    const take = Number(query.take) || 10;
    const skip = (page - 1) * take;

    const where: Prisma.QuotationWhereInput = {};

    // Filter Status
    if (query.status && query.status !== "ALL") {
      where.status = query.status as any;
    }

    if (query.search) {
      where.OR = [
        { quotationNumber: { contains: query.search } },
        { client: { b2c: { name: { contains: query.search } } } },
        { client: { b2b: { companyName: { contains: query.search } } } },
      ];
    }

    const count = await this.prisma.quotation.count({ where });
    const data = await this.prisma.quotation.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        // 1. Data Klien Utama
        client: {
          include: {
            b2c: { select: { name: true, prefix: true } },
            b2b: { select: { companyName: true } },
          },
        },
        // 2. PIC Klien (Khusus B2B)
        pic: {
          select: { name: true, phone: true },
        },
        // 3. Jejak Audit Pengguna Sistem
        user: {
          select: { name: true }, // Created By
        },
        updatedBy: {
          select: { name: true }, // Updated By
        },
        approvedBy: {
          select: { name: true }, // Approved By
        },
        // 4. Riwayat Tindak Lanjut
        followUps: {
          orderBy: { date: "asc" },
          take: 3,
          select: { name: true, date: true },
        },
        _count: {
          select: { followUps: true },
        },
      },
    });

    const meta = this.pagination.generateMeta({
      page: Number(query.page || 1),
      take: Number(query.take || 10),
      count,
    });

    return { data, meta };
  }

  // ==========================================
  // 2. GET BY ID (DETAIL)
  // ==========================================
  async getQuotationById(id: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        client: {
          include: {
            b2b: {
              include: { pics: true },
            },
            b2c: true,
          },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
        items: {
          include: {
            tiers: true,
            variant: {
              select: {
                id: true,
                variantName: true,
                price: true,
              },
            },
          },
        },
        followUps: {
          orderBy: { date: "desc" },
        },
        notes: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!quotation) throw new ApiError("Quotation not found", 404);

    // Mengambil status dari klien
    const clientStatus = quotation.client?.status || "OFFICIAL";

    let clientDetail = null;

    if (quotation.client) {
      if (quotation.client.type === "B2B" && quotation.client.b2b) {
        const b2b = quotation.client.b2b;
        clientDetail = {
          type: "B2B",
          status: clientStatus,
          id: quotation.client.id,
          custCode: quotation.client.custCode,
          name: b2b.companyName,
          email: b2b.email || "",
          phone: b2b.phone || "",
          address: b2b.fullAddress,
          city: b2b.city,
          picName: b2b.pics?.[0]?.name || "-",
        };
      } else if (quotation.client.type === "B2C" && quotation.client.b2c) {
        const b2c = quotation.client.b2c;
        clientDetail = {
          type: "B2C",
          status: clientStatus,
          id: quotation.client.id,
          custCode: quotation.client.custCode,
          name: b2c.name,
          email: "-",
          phone: b2c.phone || "",
          address: b2c.fullAddress,
          city: b2c.city,
          picName: b2c.name,
        };
      }
    }

    return {
      ...quotation,
      clientInfo: clientDetail,
      createdBy: quotation.user,
    };
  }

  // ==========================================
  // 3. CREATE QUOTATION (DIPERBAIKI)
  // ==========================================
  async createQuotation(
    data: CreateQuotationDTO,
    files: Express.Multer.File[],
  ) {
    if (!data.clientId) {
      throw new ApiError(
        "Client information is required. Please select a client.",
        400,
      );
    }

    // 2. Group file per item index
    const fileByItemIndex: Record<number, Express.Multer.File> = {};
    if (files && files.length > 0) {
      for (const file of files) {
        const match = file.fieldname.match(/^items\[(\d+)\]\[image\]$/);
        if (match) {
          const idx = parseInt(match[1], 10);
          fileByItemIndex[idx] = file;
        }
      }
    }

    // 3. Upload image per item
    const uploadedImages: Record<number, { url: string; publicId: string }> =
      {};
    for (const [idxStr, file] of Object.entries(fileByItemIndex)) {
      const idx = parseInt(idxStr, 10);
      try {
        const result = await this.cloudinary.upload(file, {
          folder: "quotation-items",
        });
        uploadedImages[idx] = {
          url: result.secure_url,
          publicId: result.public_id,
        };
      } catch (err) {
        throw new ApiError(`Gagal upload image untuk item ke-${idx + 1}`, 500);
      }
    }

    let subTotal = 0;

    // 4. Prepare Items & Tiers (SINKRON DENGAN UPDATE LOGIC)
    const itemsToCreate = await Promise.all(
      data.items.map(async (item: any, index) => {
        const img = uploadedImages[index];

        const mainQty = item.quantity ? Number(item.quantity) : 1;
        const mainPrice = item.unitPrice ? Number(item.unitPrice) : 0;
        const itemDiscount = item.discount ? Number(item.discount) : 0;

        // 4b. Hitung total baris berdasarkan input utama
        const lineTotal = mainQty * mainPrice - itemDiscount;
        subTotal += lineTotal < 0 ? 0 : lineTotal; // Tambahkan ke keseluruhan subTotal

        // 4c. Siapkan data tiers sebagai acuan referensi
        const tiersData = item.tiers && item.tiers.length > 0 ? item.tiers : [];
        const tiersToCreate = tiersData.map((tier: any) => ({
          minQuantity: tier.minQuantity ? Number(tier.minQuantity) : 1,
          maxQuantity: tier.maxQuantity ? Number(tier.maxQuantity) : null,
          quantityLabel: tier.quantityLabel || "Pcs",
          unitPrice: tier.unitPrice ? Number(tier.unitPrice) : 0,
          totalPrice:
            (tier.minQuantity ? Number(tier.minQuantity) : 1) *
            (tier.unitPrice ? Number(tier.unitPrice) : 0),
        }));

        return {
          productId: item.productId || null,
          variantId: item.variantId || null,
          productName: item.productName,
          description: item.description,

          quantity: mainQty,
          unitPrice: mainPrice,
          discount: itemDiscount,

          customization: item.customization ?? Prisma.JsonNull,
          remarks: item.remarks,
          imageUrl: img?.url ?? null,
          imagePublicId: img?.publicId ?? null,

          tiers: {
            create: tiersToCreate,
          },
        };
      }),
    );

    const totalAmount = subTotal;

    // 5. Client Code (Hanya menggunakan clientId)
    let clientCode = "NOC";
    const client = await this.prisma.client.findUnique({
      where: { id: data.clientId },
      select: { custCode: true },
    });

    if (!client) {
      throw new ApiError("Client not found in database.", 404);
    }

    if (client.custCode) {
      clientCode = client.custCode;
    }

    const now = new Date();
    const romanMonth = this.getRomanMonth(now);
    const year = now.getFullYear();

    // 6. Cari sequence tertinggi
    const allQuotations = await this.prisma.quotation.findMany({
      select: { quotationNumber: true },
    });

    let maxSequence = 0;
    for (const q of allQuotations) {
      if (!q.quotationNumber) continue;

      const parts = q.quotationNumber.split("_");
      if (parts.length >= 2) {
        const num = parseInt(parts[1], 10);
        if (!isNaN(num) && num > maxSequence) {
          maxSequence = num;
        }
      }
    }

    // 7. Retry loop untuk Quotation Number
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const nextSequence = maxSequence + 1 + attempt;
      const sequence = String(nextSequence).padStart(4, "0");

      const quotationNumber = `QTN_${sequence}_${clientCode}_${romanMonth}_${year}`;

      try {
        const newQuotation = await this.prisma.quotation.create({
          data: {
            quotationNumber,
            date: data.date || new Date(),
            validUntil: data.validUntil,
            status: "DRAFT",

            // Relasi ke User pembuat
            userId: data.userId || null,

            // Relasi murni menggunakan ID Database
            clientId: data.clientId,
            picId: (data as any).picId || null,

            // Currency & Payment Terms
            currencyCode: data.currencyCode || "IDR",
            paymentTerms: data.paymentTerms || null,

            subTotal,
            totalAmount,
            notes:
              data.notes && data.notes.length > 0
                ? {
                    createMany: {
                      data: data.notes.flatMap((note) =>
                        note.contents.map((text) => ({
                          categoryId: note.categoryId,
                          content: text,
                        })),
                      ),
                    },
                  }
                : undefined,
            items: { create: itemsToCreate },
          },
          include: {
            items: {
              include: {
                tiers: true,
                variant: {
                  select: {
                    id: true,
                    variantName: true,
                    price: true,
                  },
                },
              },
            },
            notes: { include: { category: true } },
            client: { select: { id: true, custCode: true, type: true } },
            user: { select: { id: true, name: true, email: true } },
          },
        });

        return newQuotation;
      } catch (error: any) {
        if (error?.code === "P2002" && attempt < MAX_RETRIES - 1) {
          console.warn(
            `Duplicate quotationNumber ${quotationNumber}, retrying... (attempt ${attempt + 1})`,
          );
          continue;
        }
        throw error;
      }
    }

    throw new ApiError(
      "Failed to generate unique quotation number after multiple attempts",
      500,
    );
  }

  // ==========================================
  // 4. UPDATE QUOTATION (DIPERBAIKI)
  // ==========================================
  async updateQuotation(id: string, data: UpdateQuotationDTO) {
    const existing = await this.prisma.quotation.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Quotation not found", 404);

    const { items, notes, ...headerData } = data;

    return await this.prisma.$transaction(async (tx) => {
      let newSubTotal = existing.subTotal;
      let newTotalAmount = existing.totalAmount;

      if (items && items.length > 0) {
        // Hapus item lama beserta tier-nya secara berelasi
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });

        let calculatedSubTotal = 0;

        for (const item of items) {
          // 1. Tangkap quantity dan unitPrice utama dari input form
          const mainQty = item.quantity ? Number(item.quantity) : 1;
          const mainPrice = item.unitPrice ? Number(item.unitPrice) : 0;
          const itemDiscount = item.discount ? Number(item.discount) : 0;

          // 2. Hitung total baris berdasarkan input utama (Quantity x UnitPrice - Discount)
          const lineTotal = mainQty * mainPrice - itemDiscount;
          calculatedSubTotal += lineTotal < 0 ? 0 : lineTotal;

          // 3. Siapkan data tiers sebagai acuan referensi (jika ada)
          const tiersData =
            item.tiers && item.tiers.length > 0 ? item.tiers : [];
          const tiersToCreate = tiersData.map((tier: any) => ({
            minQuantity: tier.minQuantity ? Number(tier.minQuantity) : 1,
            maxQuantity: tier.maxQuantity ? Number(tier.maxQuantity) : null,
            quantityLabel: tier.quantityLabel || "Pcs",
            unitPrice: tier.unitPrice ? Number(tier.unitPrice) : 0,
            totalPrice:
              (tier.minQuantity ? Number(tier.minQuantity) : 1) *
              (tier.unitPrice ? Number(tier.unitPrice) : 0),
          }));

          // 4. Atribut kustomisasi produk
          const customizationData = {
            ...(item.selectedAttributes
              ? { selectedAttributes: item.selectedAttributes }
              : {}),
            ...(item.customization ? { customText: item.customization } : {}),
          };

          await tx.quotationItem.create({
            data: {
              quotationId: id,
              productId: item.productId || null,
              variantId: item.variantId || null,
              productName: item.productName,
              description: item.description,
              quantity: mainQty,
              unitPrice: mainPrice,
              discount: itemDiscount,
              customization:
                Object.keys(customizationData).length > 0
                  ? customizationData
                  : Prisma.JsonNull,
              remarks: item.remarks,
              tiers: {
                create: tiersToCreate,
              },
            },
          });
        }

        newSubTotal = new Prisma.Decimal(calculatedSubTotal);
        newTotalAmount = newSubTotal;
      }

      // === LOGIC B: UPDATE NOTES ===
      if (notes) {
        await tx.quotationNote.deleteMany({ where: { quotationId: id } });
        if (notes.length > 0) {
          await tx.quotationNote.createMany({
            data: notes.flatMap((note) =>
              note.contents.map((text) => ({
                quotationId: id,
                categoryId: note.categoryId,
                content: text,
              })),
            ),
          });
        }
      }

      // === LOGIC C: BUILD UPDATE PAYLOAD ===
      const updatePayload: Prisma.QuotationUncheckedUpdateInput = {
        ...(headerData.date && { date: new Date(headerData.date) }),
        ...(headerData.validUntil !== undefined && {
          validUntil: headerData.validUntil
            ? new Date(headerData.validUntil)
            : null,
        }),
        ...(headerData.status && { status: headerData.status as any }),
        ...((headerData as any).updatedById && {
          updatedById: (headerData as any).updatedById,
        }),
        ...(headerData.userId !== undefined && {
          userId: headerData.userId || null,
        }),
        ...(headerData.clientId !== undefined && {
          clientId: headerData.clientId || null,
        }),
        ...(headerData.picId !== undefined && {
          picId: headerData.picId || null,
        }),
        ...(headerData.currencyCode !== undefined && {
          currencyCode: headerData.currencyCode,
        }),
        ...(headerData.paymentTerms !== undefined && {
          paymentTerms: headerData.paymentTerms || null,
        }),
        subTotal: newSubTotal,
        totalAmount: newTotalAmount,
      };

      return await tx.quotation.update({
        where: { id },
        data: updatePayload,
      });
    });
  }

  // ==========================================
  // 5. DELETE QUOTATION
  // ==========================================
  async deleteQuotation(id: string) {
    const existing = await this.prisma.quotation.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Quotation not found", 404);

    // Items dan FollowUps akan terhapus otomatis karena onDelete: Cascade di schema
    return await this.prisma.quotation.delete({ where: { id } });
  }

  // Tambah Follow Up Baru
  async addFollowUp(quotationId: string, data: CreateFollowUpDTO) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
    });

    if (!quotation) {
      throw new ApiError("Quotation not found", 404);
    }

    // 1. Simpan Follow Up ke Database
    const followUp = await this.prisma.quotationFollowUp.create({
      data: {
        quotationId,
        name: data.name,
        date: data.date || new Date(),
        method: data.method,
        notes: data.notes,
        nextAction: data.nextAction,
      },
    });

    // 2. Logika Update Status Quotation Otomatis
    const actionName = data.name.toLowerCase();

    if (actionName.includes("convert")) {
      await this.prisma.quotation.update({
        where: { id: quotationId },
        data: { status: "ACCEPTED" },
      });
    } else if (quotation.status === "DRAFT" || quotation.status === "SENT") {
      await this.prisma.quotation.update({
        where: { id: quotationId },
        data: { status: "FOLLOW_UP" },
      });
    }

    return followUp;
  }

  // Get History Follow Up
  async getFollowUps(quotationId: string) {
    return await this.prisma.quotationFollowUp.findMany({
      where: { quotationId },
      orderBy: { date: "desc" },
    });
  }

  // ==========================================
  // GET ALL FOLLOW UPS (GLOBAL WITH PAGINATION & SEARCH)
  // ==========================================
  async getAllFollowUps(query: {
    page?: number;
    take?: number;
    search?: string;
  }) {
    const page = Number(query.page) || 1;
    const take = Number(query.take) || 10;
    const skip = (page - 1) * take;

    const where: Prisma.QuotationFollowUpWhereInput = {};

    // Filter Pencarian (Search)
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { notes: { contains: query.search } },
        { quotation: { quotationNumber: { contains: query.search } } },
      ];
    }

    // Hitung total data untuk meta paginasi
    const count = await this.prisma.quotationFollowUp.count({ where });

    // Ambil data beserta relasinya
    const data = await this.prisma.quotationFollowUp.findMany({
      where,
      skip,
      take,
      orderBy: { date: "desc" },
      include: {
        quotation: {
          select: {
            id: true,
            quotationNumber: true,
            client: {
              include: {
                b2b: true,
                b2c: true,
              },
            },
          },
        },
      },
    });

    const meta = this.pagination.generateMeta({
      page: Number(query.page || 1),
      take: Number(query.take || 10),
      count,
    });

    return { data, meta };
  }

  async getQuotationByIdForPrint(id: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        client: {
          include: {
            b2b: {
              include: { department: true },
            },
            b2c: true,
          },
        },
        // 2. PIC
        pic: {
          select: {
            id: true,
            name: true,
            prefix: true,
            phone: true,
            email: true,
          },
        },
        // 3. User (Sales Internal)
        user: {
          select: { name: true, email: true },
        },
        // 4. Items
        items: {
          include: {
            tiers: true,
            variant: {
              select: {
                variantName: true,
              },
            },
            product: {
              select: {
                sku: true,
                name: true,
                description: true,
                images: {
                  select: {
                    url: true,
                  },
                  take: 1,
                },
              },
            },
          },
        },
        notes: {
          include: {
            category: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!quotation) {
      throw new ApiError("Quotation not found", 404);
    }

    // ====================================================================
    // LANGKAH 1: Kumpulkan semua UUID Atribut & Value dari JSON Customization
    // ====================================================================
    const attributeIds = new Set<string>();
    const valueIds = new Set<string>();

    (quotation.items as any[]).forEach((item) => {
      if (item.customization) {
        try {
          const parsed =
            typeof item.customization === "string"
              ? JSON.parse(item.customization)
              : item.customization;

          const attrs = parsed?.selectedAttributes || parsed;
          if (typeof attrs === "object" && attrs !== null) {
            Object.entries(attrs).forEach(([attrId, valId]) => {
              attributeIds.add(attrId);
              valueIds.add(String(valId));
            });
          }
        } catch (error) {}
      }
    });

    // ====================================================================
    // LANGKAH 2: Ambil Nama Asli dari Database (Prisma)
    // Berdasarkan skema: model Attribute dan model AttributeValue
    // ====================================================================
    const attributes = await this.prisma.attribute.findMany({
      where: { id: { in: Array.from(attributeIds) } },
      select: { id: true, name: true },
    });

    const attributeValues = await this.prisma.attributeValue.findMany({
      where: { id: { in: Array.from(valueIds) } },
      select: { id: true, value: true },
    });

    const attrDictionary = Object.fromEntries(
      attributes.map((a) => [a.id, a.name]),
    );
    const valDictionary = Object.fromEntries(
      attributeValues.map((v) => [v.id, v.value]),
    );

    // ====================================================================
    // LANGKAH 3: Terjemahkan dan Rapikan Data Item
    // ====================================================================
    const normalizedItems = (quotation.items as any[]).map((item) => {
      let imageUrl: string | null = null;

      if (item.product?.images?.[0]?.url) {
        imageUrl = item.product.images[0].url;
      } else if (item.imageUrl) {
        imageUrl = item.imageUrl;
      }

      const finalDescription =
        item.description || item.product?.description || null;
      let readableCustomization: Record<string, string> | string | null = null;

      if (item.customization) {
        try {
          const parsed =
            typeof item.customization === "string"
              ? JSON.parse(item.customization)
              : item.customization;

          const attrs = parsed?.selectedAttributes || parsed;

          if (typeof attrs === "object" && attrs !== null) {
            const customizationObject: Record<string, string> = {};
            Object.entries(attrs).forEach(([attrId, valId]) => {
              const realName = attrDictionary[attrId] || attrId;
              const realValue = valDictionary[String(valId)] || String(valId);

              customizationObject[realName] = realValue;
            });
            readableCustomization = customizationObject;
          } else {
            // Jika format JSON-nya berbeda dari ekspektasi
            readableCustomization = attrs;
          }
        } catch (error) {
          // Jika data aslinya memang berupa teks biasa (bukan JSON)
          readableCustomization = item.customization;
        }
      }

      return {
        ...item,
        imageUrl,
        description: finalDescription,
        customization: readableCustomization, // Kirimkan data yang sudah diterjemahkan!
        remarks: item.remarks ?? null,
        tiers: item.tiers || [],
      };
    });

    return {
      ...quotation,
      validUntil: quotation.validUntil ?? null,
      items: normalizedItems,
      createdBy: quotation.user,
    };
  }
  // ====================================================================
  // GET QUOTATION REFERENCES (Hanya ID dan Nomor untuk Dropdown Order)
  // ====================================================================
  async getQuotationReferences() {
    try {
      return await this.prisma.quotation.findMany({
        select: {
          id: true,
          quotationNumber: true,
        },
        orderBy: {
          quotationNumber: "desc",
        },
      });
    } catch (error) {
      console.error("🔥 GET QUOTATION REFERENCES ERROR:", error);
      throw new ApiError("Gagal mengambil daftar referensi quotation.", 500);
    }
  }
}
