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

  // Helper: Generate Kode Singkatan Nama Manual
  private generateManualClientCode(name: string): string {
    // 1. Bersihkan Title (PT, CV, Mr, Mrs, dll) dan spasi berlebih
    const cleanName = name
      .replace(/^(PT\.?|CV\.?|UD\.?|Mr\.?|Mrs\.?|Ms\.?|Bpk\.?|Ibu\.?)\s*/i, "")
      .replace(/[^a-zA-Z\s]/g, "") // Hapus karakter aneh
      .trim();

    const words = cleanName.split(/\s+/);
    let code = "";

    if (words.length >= 3) {
      // Kasus: PT. ALUNA MUSIK INDONESIA -> (A)LUNA (M)USIK (I)NDONESIA -> AMI
      code = words[0][0] + words[1][0] + words[2][0];
    } else if (words.length === 2) {
      // Kasus: Nadya Yuniar -> (N)adya (Y)unia(r) -> NYR
      code = words[0][0] + words[1][0] + words[1].slice(-1);
    } else if (words.length === 1) {
      // Kasus: Google -> GOO
      code = words[0].substring(0, 3);
    }

    return code.toUpperCase();
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
        { manualClientName: { contains: query.search } },
        { manualClientCompany: { contains: query.search } },
      ];
    }

    const count = await this.prisma.quotation.count({ where });
    const data = await this.prisma.quotation.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          include: {
            b2c: { select: { name: true, prefix: true } },
            b2b: { select: { companyName: true } },
          },
        },

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
    let clientDetail = null;

    if (quotation.clientId && quotation.client) {
      if (quotation.client.type === "B2B" && quotation.client.b2b) {
        const b2b = quotation.client.b2b;
        clientDetail = {
          source: "DATABASE",
          type: "B2B",
          id: quotation.client.id,
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
          source: "DATABASE",
          type: "B2C",
          id: quotation.client.id,
          name: b2c.name,
          email: "-",
          phone: b2c.phone || "",
          address: b2c.fullAddress,
          city: b2c.city,
          picName: b2c.name,
        };
      }
    } else {
      clientDetail = {
        source: "MANUAL",
        type: "MANUAL",
        id: null,
        name: quotation.manualClientName || "Unknown",
        email: quotation.manualClientEmail || "",
        phone: quotation.manualClientPhone || "",
        address: quotation.manualClientAddress || "",
        city: "-",
        picName: quotation.manualClientName,
      };
    }

    return {
      ...quotation,
      clientInfo: clientDetail,
    };
  }

  // ==========================================
  // 3. CREATE QUOTATION
  // ==========================================
  async createQuotation(
    data: CreateQuotationDTO,
    files: Express.Multer.File[],
  ) {
    if (!data.clientId && !data.manualClientName) {
      throw new ApiError(
        "Client information is required. Select a client from DB or input manually.",
        400,
      );
    }

    // 1. Group file per item index
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

    // 2. Upload image per item
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

    // 3. Prepare Items & Tiers
    const itemsToCreate = await Promise.all(
      data.items.map(async (item: any, index) => {
        let variantPrice: number | null = null;

        // A. Validasi Produk & Variant
        if (item.productId) {
          const product = await this.prisma.product.findUnique({
            where: { id: item.productId },
            include: { productVariants: true },
          });

          // 🔥 Jika product custom, wajib ada variantId
          if (product?.isCustom) {
            if (!item.variantId) {
              throw new ApiError(
                `Variant wajib dipilih untuk product custom: ${product.name}`,
                400,
              );
            }
            const variant = product.productVariants.find(
              (v) => v.id === item.variantId,
            );
            if (!variant) {
              throw new ApiError(
                `Variant tidak valid untuk product: ${product.name}`,
                400,
              );
            }
            // Simpan harga variant jika sewaktu-waktu tier tidak mengirimkan harga
            if (variant.price) {
              variantPrice = Number(variant.price);
            }
          }
        }

        const img = uploadedImages[index];

        // 🟢 B. FORMAT DATA TIERS
        // Gunakan item.tiers jika ada.
        // Fallback ditambahkan untuk berjaga-jaga jika payload lama masih mengirimkan `quantity`
        const tiersData =
          item.tiers && item.tiers.length > 0
            ? item.tiers
            : [
                {
                  minQuantity: item.quantity ? Number(item.quantity) : 1,
                  maxQuantity: undefined,
                  quantityLabel: item.quantityLabel || null,
                  unitPrice: item.unitPrice || 0,
                },
              ];

        const tiersToCreate = tiersData.map((tier: any) => {
          let finalUnitPrice = tier.unitPrice;

          // Jika harga tier 0/kosong tapi variant memiliki harga, gunakan harga variant
          if (!finalUnitPrice && variantPrice !== null) {
            finalUnitPrice = variantPrice;
          }

          // 🟢 Hitung total per baris tier (berdasarkan minQuantity sebagai pengali dasar)
          const baseQtyForCalculation = tier.minQuantity
            ? Number(tier.minQuantity)
            : 1;
          const lineTotal =
            baseQtyForCalculation * Number(finalUnitPrice) -
            Number(item.discount || 0);

          return {
            minQuantity: baseQtyForCalculation,
            maxQuantity: tier.maxQuantity ? Number(tier.maxQuantity) : null,
            quantityLabel: tier.quantityLabel || null,
            unitPrice: finalUnitPrice,
            totalPrice: lineTotal < 0 ? 0 : lineTotal, // Mencegah minus
          };
        });

        // 🟢 C. HITUNG SUBTOTAL QUOTATION
        // Karena ada multi-opsi, kita ambil opsi tier pertama (index 0) sebagai estimasi default SubTotal
        if (tiersToCreate.length > 0) {
          subTotal += tiersToCreate[0].totalPrice;
        }

        return {
          productId: item.productId || null,
          variantId: item.variantId || null,
          productName: item.productName,
          description: item.description,

          customization: item.customization ?? Prisma.JsonNull,
          remarks: item.remarks,
          imageUrl: img?.url ?? null,
          imagePublicId: img?.publicId ?? null,

          // 🟢 RELASIKAN TIERS KE ITEM
          tiers: {
            create: tiersToCreate,
          },
        };
      }),
    );

    const totalAmount = subTotal;

    // 4. Client Code
    let clientCode = "NOC";
    if (data.clientId) {
      const client = await this.prisma.client.findUnique({
        where: { id: data.clientId },
        select: { custCode: true },
      });
      if (client?.custCode) clientCode = client.custCode;
    } else if (data.manualClientName) {
      clientCode = this.generateManualClientCode(data.manualClientName);
    }

    const now = new Date();
    const romanMonth = this.getRomanMonth(now);
    const year = now.getFullYear();

    // 5. Cari sequence tertinggi
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

    // 6. Retry loop
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
            salesId: data.salesId || null,
            clientId: data.clientId || null,
            manualClientName: data.manualClientName,
            manualClientCompany: data.manualClientCompany,
            manualClientEmail: data.manualClientEmail,
            manualClientPhone: data.manualClientPhone,
            manualClientAddress: data.manualClientAddress,
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
                tiers: true, // 🟢 INCLUDE TIERS agar otomatis dikembalikan dalam response
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
            sales: true,
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
  // 4. UPDATE QUOTATION
  // ==========================================
  async updateQuotation(id: string, data: UpdateQuotationDTO) {
    console.log("=== PAYLOAD MASUK DARI FRONTEND ===");
    console.log(JSON.stringify(data.items, null, 2));
    console.log("===================================");
    const existing = await this.prisma.quotation.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Quotation not found", 404);

    const { items, notes, ...headerData } = data;

    return await this.prisma.$transaction(async (tx) => {
      let newSubTotal = existing.subTotal;
      let newTotalAmount = existing.totalAmount;

      if (items && items.length > 0) {
        // Hapus item lama, akan diganti dengan yang baru dari payload
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });

        let calculatedSubTotal = 0;

        for (const item of items) {
          // 🟢 FORMAT DATA TIERS (Sesuai dengan skema baru)
          const tiersData =
            item.tiers && item.tiers.length > 0
              ? item.tiers
              : [
                  {
                    minQuantity: item.quantity ? Number(item.quantity) : 1, // Fallback jika format lama
                    maxQuantity: undefined,
                    quantityLabel: item.quantityLabel || null,
                    unitPrice: item.unitPrice || 0,
                  },
                ];

          const tiersToCreate = tiersData.map((tier: any) => {
            const baseQtyForCalculation = tier.minQuantity
              ? Number(tier.minQuantity)
              : 1;
            const finalUnitPrice = tier.unitPrice || 0;

            // Hitung total per baris menggunakan minQuantity
            const lineTotal =
              baseQtyForCalculation * Number(finalUnitPrice) -
              Number(item.discount || 0);

            return {
              minQuantity: baseQtyForCalculation,
              maxQuantity: tier.maxQuantity ? Number(tier.maxQuantity) : null,
              quantityLabel: tier.quantityLabel || null,
              unitPrice: finalUnitPrice,
              totalPrice: lineTotal < 0 ? 0 : lineTotal, // Mencegah minus
            };
          });

          // Ambil tier pertama untuk perhitungan subtotal default
          if (tiersToCreate.length > 0) {
            calculatedSubTotal += tiersToCreate[0].totalPrice;
          }

          // Insert Item beserta relasi Tier-nya
          await tx.quotationItem.create({
            data: {
              quotationId: id,
              productId: item.productId || null,
              variantId: item.variantId || null,
              productName: item.productName,
              description: item.description,
              discount: item.discount || 0,
              customization: item.customization ?? Prisma.JsonNull,
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
        // Header fields
        ...(headerData.date && { date: new Date(headerData.date) }),
        ...(headerData.validUntil !== undefined && {
          validUntil: headerData.validUntil
            ? new Date(headerData.validUntil)
            : null,
        }),
        ...(headerData.status && { status: headerData.status as any }),
        ...(headerData.clientId !== undefined && {
          clientId: headerData.clientId || null,
        }),
        ...(headerData.picId !== undefined && {
          picId: headerData.picId || null,
        }),
        ...(headerData.manualClientName !== undefined && {
          manualClientName: headerData.manualClientName,
        }),
        ...(headerData.manualClientCompany !== undefined && {
          manualClientCompany: headerData.manualClientCompany,
        }),
        ...(headerData.manualClientEmail !== undefined && {
          manualClientEmail: headerData.manualClientEmail || null,
        }),
        ...(headerData.manualClientPhone !== undefined && {
          manualClientPhone: headerData.manualClientPhone,
        }),
        ...(headerData.manualClientAddress !== undefined && {
          manualClientAddress: headerData.manualClientAddress,
        }),

        // Financials
        subTotal: newSubTotal,
        totalAmount: newTotalAmount,
      };

      return await tx.quotation.update({
        where: { id },
        data: updatePayload,
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
          notes: {
            include: { category: true },
          },
        },
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

  // Get Detail Quotation untuk Print / Preview
  async getQuotationByIdForPrint(id: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        // 1. Data Client
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

        // 3. Items
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
                    isFeatured: true,
                  },
                  take: 1,
                },
              },
            },
          },
        },

        // 4. Notes
        notes: {
          include: {
            category: true,
          },
          orderBy: { createdAt: "asc" },
        },

        // 5. Sales
        sales: true,
      },
    });

    if (!quotation) {
      throw new ApiError("Quotation not found", 404);
    }

    const normalizedItems = quotation.items.map((item) => {
      let imageUrl: string | null = null;

      if (item.product?.images?.[0]?.url) {
        imageUrl = item.product.images[0].url;
      } else if (item.imageUrl) {
        imageUrl = item.imageUrl;
      }
      const finalDescription =
        item.description || item.product?.description || null;
      return {
        ...item,
        imageUrl,
        description: finalDescription,
        remarks: item.remarks ?? null,
        tiers: item.tiers || [],
      };
    });

    return {
      ...quotation,
      validUntil: quotation.validUntil ?? null,
      items: normalizedItems,
    };
  }

  // ====================================================================
  // GET QUOTATION REFERENCES (Hanya ID dan Nomor untuk Dropdown Order)
  // ====================================================================
  async getQuotationReferences() {
    try {
      return await this.prisma.quotation.findMany({
        where: {
          status: "ACCEPTED",
          orderId: null,
          resultingOrders: {
            none: {},
          },
        },
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
