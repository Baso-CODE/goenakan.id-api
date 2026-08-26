import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { CounterService } from "../../../utils/counter.service";
import { CloudinaryService } from "../../cloudinary/cloudinary.service";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateFollowUpDTO } from "./dto/follow-up.dto";
import { CreateQuotationDTO, UpdateQuotationDTO } from "./dto/quotation.dto";

@injectable()
export class QuotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly cloudinary: CloudinaryService,
    private readonly counterService: CounterService,
  ) {}

  // ====================================================================
  // HELPER: GENERATE QUOTATION NUMBER (Aman dari Race Condition)
  // Format Baru: GI-QNYYMMXXXJJ (Contoh: GI-QN260300101)
  // ====================================================================
  private async generateQuotationNumber(
    tx: any,
    custCode: string,
  ): Promise<string> {
    // 1. Dapatkan periode Tahun & Bulan (YYMM), contoh: "2603"
    const periodYYMM = this.counterService.getCurrentPeriodYYMM();

    // 2. Dapatkan XXX (3 digit urutan client berdasarkan custCode database)
    // Kita ekstrak angka dari custCode (misal: "C-005" atau "005" -> akan diambil "005")
    let clientSeq = "000";
    const numberMatch = custCode.match(/\d+/);
    if (numberMatch) {
      // Pastikan selalu 3 digit (tambah nol di depan jika kurang, potong jika lebih)
      clientSeq = numberMatch[0].padStart(3, "0").slice(-3);
    } else {
      // Fallback jika custCode klien kebetulan tidak mengandung angka sama sekali
      clientSeq = "999";
    }

    // 3. Dapatkan JJ (2 digit urutan Quotation per bulan)
    // Tipe counter "QN_2603" agar mereset dari 01 setiap bulan berganti
    const counterType = `QN_${periodYYMM}`;
    const quotationSeq = await this.counterService.getNextFormattedNumber(
      tx,
      counterType,
      periodYYMM,
      2, // padding 2 digit (JJ)
    );

    // 4. Gabungkan menjadi satu string
    return `GI-QN${periodYYMM}${clientSeq}${quotationSeq}`;
  }
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

    // A. CEK CLIENT SEBELUM TRANSAKSI MULAI (Agar bisa dapat custCode)
    const client = await this.prisma.client.findUnique({
      where: { id: data.clientId },
      select: { custCode: true },
    });

    if (!client) {
      throw new ApiError("Client not found in database.", 404);
    }

    // B. UPLOAD CLOUDINARY (Dilakukan di luar transaksi agar aman)
    const fileByItemIndex: Record<number, Express.Multer.File> = {};
    if (files && files.length > 0) {
      for (const file of files) {
        const match = file.fieldname.match(/^items\[(\d+)\]\[image\]$/);
        if (match) {
          fileByItemIndex[parseInt(match[1], 10)] = file;
        }
      }
    }

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

    // C. PERSIAPKAN DATA ITEMS & HITUNG TOTAL HARGA
    let subTotal = 0;
    const itemsToCreate: any[] = [];

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const img = uploadedImages[i];

      // ✨ PERBAIKAN UTAMA KUANTITAS: Pastikan dibaca sebagai angka dengan benar
      const mainQty =
        item.quantity !== undefined && item.quantity !== null
          ? Number(item.quantity)
          : 1;

      const itemDiscount = item.discount ? Number(item.discount) : 0;

      // 1. Pastikan productId tersedia
      if (!item.productId) {
        throw new ApiError(`Product ID diperlukan untuk item ke-${i + 1}`, 400);
      }

      // 2. Ambil harga dasar produk beserta attributeValues dan priceModifier-nya dari database
      const productRecord = await this.prisma.product.findUnique({
        where: { id: item.productId },
        select: {
          name: true,
          basePrice: true,
          // ✨ PERBAIKAN: Menggunakan 'attributeValues' sesuai skema Prisma kamu
          attributeValues: {
            select: {
              attributeValueId: true,
              priceModifier: true,
            },
          },
        },
      });

      if (!productRecord) {
        throw new ApiError(
          `Produk dengan ID ${item.productId} tidak ditemukan`,
          404,
        );
      }

      // Mulai perhitungan: Unit Price = Base Price
      let finalUnitPrice = Number(productRecord.basePrice);

      // 3. Tambahkan harga dari atribut yang dipilih (Multi-Select Attributes)
      if (
        item.selectedAttributes &&
        typeof item.selectedAttributes === "object"
      ) {
        const allSelectedValIds = Object.values(item.selectedAttributes)
          .flat()
          .filter(Boolean) as string[];

        // ✨ PERBAIKAN: Mengambil data dari attributeValues
        const productAttributes = productRecord.attributeValues as any[];

        if (
          productAttributes &&
          productAttributes.length > 0 &&
          allSelectedValIds.length > 0
        ) {
          productAttributes.forEach((attrVal: any) => {
            if (allSelectedValIds.includes(attrVal.attributeValueId)) {
              finalUnitPrice += Number(attrVal.priceModifier || 0);
            }
          });
        }
      }

      // 4. Jika ada varian yang dipilih, ambil harga varian dari DB lalu tambahkan
      if (item.variantId) {
        const variantRecord = await this.prisma.productVariant.findUnique({
          where: { id: item.variantId },
          select: { price: true },
        });

        if (variantRecord && variantRecord.price) {
          finalUnitPrice += Number(variantRecord.price);
        }
      }

      // ✨ Hitung total harga per baris menggunakan kuantitas yang benar (Kuantitas * Harga Akhir - Diskon)
      const lineTotal = mainQty * finalUnitPrice - itemDiscount;
      subTotal += lineTotal < 0 ? 0 : lineTotal;

      // Siapkan Tiers
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

      // Masukkan hasil data dengan `quantity: mainQty` yang akurat
      itemsToCreate.push({
        productId: item.productId,
        variantId: item.variantId || null,
        productName: item.productName || productRecord.name,
        description: item.description,
        quantity: mainQty, // 👈 Terbaca sesuai inputan user (misal: 10)
        unitPrice: finalUnitPrice, // 👈 Harga satuan sudah termasuk tambahan atribut/varian
        selectedAttributes: item.selectedAttributes ?? Prisma.JsonNull,
        discount: itemDiscount,
        customization: item.customization ?? Prisma.JsonNull,
        remarks: item.remarks,
        imageUrl: img?.url ?? null,
        imagePublicId: img?.publicId ?? null,
        tiers: { create: tiersToCreate },
      });
    }

    // D. BUKA TRANSAKSI UNTUK MENYIMPAN KE DATABASE
    const newQuotation = await this.prisma.$transaction(async (tx) => {
      const quotationNumber = await this.generateQuotationNumber(
        tx,
        client.custCode || "000",
      );

      const quotation = await tx.quotation.create({
        data: {
          quotationNumber,
          date: data.date || new Date(),
          validUntil: data.validUntil,
          status: "DRAFT",
          userId: data.userId || null,
          clientId: data.clientId,
          picId: (data as any).picId || null,
          currencyCode: data.currencyCode || "IDR",
          paymentTerms: data.paymentTerms || null,
          subTotal,
          totalAmount: subTotal,

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
              variant: { select: { id: true, variantName: true, price: true } },
            },
          },
          notes: { include: { category: true } },
          client: { select: { id: true, custCode: true, type: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      });

      return quotation;
    });

    return newQuotation;
  }

  // ==========================================
  // 4. UPDATE QUOTATION (DIPERBARUI)
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

        // ✨ GUNAKAN FOR OF LOOP AGAR BISA MELAKUKAN AWAIT KE DATABASE
        for (const item of items) {
          const mainQty = item.quantity ? Number(item.quantity) : 1;
          const itemDiscount = item.discount ? Number(item.discount) : 0;

          // 1. Pastikan productId tersedia
          if (!item.productId) {
            throw new ApiError(
              "Product ID diperlukan untuk setiap item quotation",
              400,
            );
          }

          // 2. Ambil harga dasar produk BESERTA attributeValues (Disamakan dengan Create)
          const productRecord = await tx.product.findUnique({
            where: { id: item.productId },
            select: {
              name: true,
              basePrice: true,
              // ✨ PERBAIKAN: Mengambil modifier atribut dari database
              attributeValues: {
                select: {
                  attributeValueId: true,
                  priceModifier: true,
                },
              },
            },
          });

          if (!productRecord) {
            throw new ApiError(
              `Produk dengan ID ${item.productId} tidak ditemukan`,
              404,
            );
          }

          // ✨ Kalkulasi awal: Unit Price = Base Price
          let finalUnitPrice = Number(productRecord.basePrice);

          // ✨ PERBAIKAN: 3. Tambahkan harga dari atribut yang dipilih (Multi-Select Attributes)
          if (
            item.selectedAttributes &&
            typeof item.selectedAttributes === "object"
          ) {
            const allSelectedValIds = Object.values(item.selectedAttributes)
              .flat()
              .filter(Boolean) as string[];

            const productAttributes = productRecord.attributeValues as any[];

            if (
              productAttributes &&
              productAttributes.length > 0 &&
              allSelectedValIds.length > 0
            ) {
              productAttributes.forEach((attrVal: any) => {
                if (allSelectedValIds.includes(attrVal.attributeValueId)) {
                  finalUnitPrice += Number(attrVal.priceModifier || 0);
                }
              });
            }
          }

          // 4. Jika ada varian yang dipilih, ambil harga varian lalu tambahkan
          if (item.variantId) {
            const variantRecord = await tx.productVariant.findUnique({
              where: { id: item.variantId },
              select: { price: true },
            });

            // Catatan: Jika di frontend harga varian tidak ditambah, pastikan di sini juga sesuai dengan kebutuhan bisnis kamu.
            // Saat ini disamakan 100% dengan fungsi createQuotation.
            if (variantRecord && variantRecord.price) {
              finalUnitPrice += Number(variantRecord.price);
            }
          }

          // 5. Hitung total baris berdasarkan harga hasil kalkulasi backend (Quantity x Final Unit Price - Discount)
          const lineTotal = mainQty * finalUnitPrice - itemDiscount;
          calculatedSubTotal += lineTotal < 0 ? 0 : lineTotal;

          // 6. Siapkan data tiers (bisa dikurangi atau diubah oleh admin dari frontend)
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

          // 7. Simpan item baru dengan harga murni dan atribut multi-pilihan
          await tx.quotationItem.create({
            data: {
              quotationId: id,
              productId: item.productId,
              variantId: item.variantId || null,
              productName: item.productName || productRecord.name,
              description: item.description,
              quantity: mainQty,
              unitPrice: finalUnitPrice, // ✨ Menggunakan harga kalkulasi yang aman
              discount: itemDiscount,
              selectedAttributes: item.selectedAttributes ?? Prisma.JsonNull,
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
            b2b: { include: { department: true } },
            b2c: true,
          },
        },
        pic: {
          select: {
            id: true,
            name: true,
            prefix: true,
            phone: true,
            email: true,
          },
        },
        user: {
          select: { name: true, email: true },
        },
        items: {
          include: {
            tiers: true,
            variant: {
              select: { variantName: true },
            },
            product: {
              select: {
                sku: true,
                name: true,
                slug: true,
                basePrice: true,
                description: true,
                images: {
                  select: { url: true },
                  take: 1,
                },
                attributeValues: {
                  include: {
                    attribute: true,
                    attributeValue: true,
                  },
                },
              },
            },
          },
        },
        notes: {
          include: { category: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!quotation) throw new ApiError("Quotation not found", 404);

    const normalizedItems = quotation.items.map((item) => {
      let imageUrl: string | null = null;
      if (item.product?.images?.[0]?.url) {
        imageUrl = item.product.images[0].url;
      } else if (item.imageUrl) {
        imageUrl = item.imageUrl;
      }

      const finalDescription =
        item.description || item.product?.description || null;

      // 1. Ambil data atribut mentah
      let rawAttrs: any = {};
      if (item.selectedAttributes) {
        try {
          rawAttrs =
            typeof item.selectedAttributes === "string"
              ? JSON.parse(item.selectedAttributes)
              : item.selectedAttributes;
        } catch (error) {}
      }

      let readableCustomization: any = null;
      if (item.customization) {
        try {
          readableCustomization =
            typeof item.customization === "string"
              ? JSON.parse(item.customization)
              : item.customization;
        } catch {
          readableCustomization = item.customization;
        }
      }

      // ✨ KUNCI PERBAIKAN LOGIKA: Filter atribut yang benar-benar ada isinya
      const validAttrKeys = Object.keys(rawAttrs || {}).filter((key) => {
        const val = rawAttrs[key];
        if (Array.isArray(val)) return val.length > 0; // Abaikan array kosong []
        return val !== null && val !== undefined && val !== ""; // Abaikan null/string kosong
      });

      // Jika validAttrKeys.length > 0, berarti ada atribut yang dipilih
      const hasAnySelection = validAttrKeys.length > 0;
      const isPriceStartFrom = !hasAnySelection; // Start From HANYA true jika tidak ada pilihan

      let availableAttributes: any[] = [];
      if (item.product && (item.product as any).attributeValues) {
        const attrMap = new Map();

        (item.product as any).attributeValues.forEach((pav: any) => {
          if (!pav.attribute || !pav.attributeValue) return;

          const attrId = pav.attribute.id;
          const valId = pav.attributeValue.id;

          let shouldInclude = false;

          // ✨ LOGIKA BERCABANG TEGAS
          if (hasAnySelection) {
            // KONDISI 1: Ada atribut yang dipilih -> HANYA masukkan yang cocok
            if (validAttrKeys.includes(attrId)) {
              const userSelectedVals = Array.isArray(rawAttrs[attrId])
                ? rawAttrs[attrId].map(String)
                : [String(rawAttrs[attrId])];

              if (userSelectedVals.includes(String(valId))) {
                shouldInclude = true;
              }
            }
          } else {
            // KONDISI 2: Tidak ada yang dipilih sama sekali -> Masukkan SEMUA
            shouldInclude = true;
          }

          // Proses memasukkan data yang lolos seleksi
          if (shouldInclude) {
            if (!attrMap.has(attrId)) {
              attrMap.set(attrId, {
                attributeId: attrId,
                attributeName: pav.attribute.name,
                hasSelection: hasAnySelection, // Jika ada seleksi, tandai true untuk frontend
                values: [],
              });
            }

            // Membersihkan link https
            let rawValue = pav.attributeValue.value;
            let cleanValue = rawValue;
            if (typeof rawValue === "string" && rawValue.includes("|")) {
              cleanValue = rawValue.split("|")[0].trim();
            }

            attrMap.get(attrId).values.push({
              valueId: valId,
              value: cleanValue,
              priceModifier: Number(pav.priceModifier || 0),
            });
          }
        });

        availableAttributes = Array.from(attrMap.values());
      }

      return {
        ...item,
        product: item.product ? { ...item.product, availableAttributes } : null,
        imageUrl,
        description: finalDescription,
        customization: readableCustomization,
        rawAttributes: rawAttrs || {},
        remarks: item.remarks ?? null,
        tiers: item.tiers || [],
        isPriceStartFrom, // Kirimkan flag penentu Start From
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
