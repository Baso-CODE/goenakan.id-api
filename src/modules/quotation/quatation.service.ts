import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";

import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFollowUpDTO } from "./dto/follow-up.dto";
import { CreateQuotationDTO, UpdateQuotationDTO } from "./dto/quotation.dto";

@injectable()
export class QuotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  // ==========================================
  // HELPER: GENERATE QUOTATION NUMBER
  // Format: QUO-20231027-1234
  // ==========================================
  private generateQuotationNumber(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const random = Math.floor(1000 + Math.random() * 9000); // 4 digit random
    return `QUO-${year}${month}${day}-${random}`;
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

        // --- PERBAIKAN PENCARIAN CLIENT (DB) ---
        // Cek di tabel B2C (field: name)
        { client: { b2c: { name: { contains: query.search } } } },
        // Cek di tabel B2B (field: companyName)
        { client: { b2b: { companyName: { contains: query.search } } } },

        // Pencarian Manual Input
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
        // --- PERBAIKAN SELECT CLIENT ---
        client: {
          include: {
            // Ambil data B2C jika ada
            b2c: { select: { name: true, prefix: true } },
            // Ambil data B2B jika ada
            b2b: { select: { companyName: true } },
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

  // ==========================================
  // 2. GET BY ID (DETAIL)
  // ==========================================
  async getQuotationById(id: string) {
    // 1. Ambil data dengan Deep Nested Include
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        // Include Client beserta detail B2B / B2C nya
        client: {
          include: {
            b2b: {
              include: { pics: true }, // Opsional: ambil PIC jika perlu
            },
            b2c: true,
          },
        },
        items: true,
        followUps: {
          orderBy: { date: "desc" },
        },
      },
    });

    if (!quotation) throw new ApiError("Quotation not found", 404);

    // 2. Logic Penyeragaman Data Client (Data Transformation)
    // Tujuannya agar Frontend tidak pusing ngecek if-else terlalu banyak
    let clientDetail = null;

    if (quotation.clientId && quotation.client) {
      // === KASUS 1: CLIENT DARI DATABASE ===

      if (quotation.client.type === "B2B" && quotation.client.b2b) {
        // Ambil data B2B
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
          picName: b2b.pics?.[0]?.name || "-", // Ambil PIC pertama jika ada
        };
      } else if (quotation.client.type === "B2C" && quotation.client.b2c) {
        // Ambil data B2C
        const b2c = quotation.client.b2c;
        clientDetail = {
          source: "DATABASE",
          type: "B2C",
          id: quotation.client.id,
          name: b2c.name,
          email: "-", // Schema B2C Anda tidak ada email, sesuaikan jika ada
          phone: b2c.phone || "",
          address: b2c.fullAddress,
          city: b2c.city,
          picName: b2c.name, // B2C PIC-nya ya orang itu sendiri
        };
      }
    } else {
      // === KASUS 2: CLIENT MANUAL ===
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

    // 3. Return data asli quotation + field baru 'clientInfo' yang sudah rapi
    return {
      ...quotation,
      clientInfo: clientDetail,
    };
  }

  // ==========================================
  // 3. CREATE QUOTATION
  // ==========================================
  async createQuotation(data: CreateQuotationDTO) {
    // 1. Validasi Hybrid Client
    if (!data.clientId && !data.manualClientName) {
      throw new ApiError(
        "Client information is required. Select a client from DB or input manually.",
        400,
      );
    }

    // 2. Kalkulasi Item & Subtotal
    let subTotal = 0;

    // Mapping items untuk Prisma Create
    const itemsToCreate = data.items.map((item) => {
      // Hitung total per baris: (Qty * Harga) - Diskon
      const lineTotal = item.quantity * item.unitPrice - (item.discount || 0);

      subTotal += lineTotal;

      return {
        productId: item.productId || null,
        productName: item.productName, // Snapshot nama produk
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
        totalPrice: lineTotal,
        customization: item.customization ?? Prisma.JsonNull,
        remarks: item.remarks,
      };
    });

    // 3. Hitung Grand Total (Simple logic: Subtotal = TotalAmount for now)
    // Nanti bisa dikembangkan tambah PPN (Tax) di sini
    const totalAmount = subTotal;

    // 4. Generate Nomor
    const quotationNumber = this.generateQuotationNumber();

    // 5. Simpan ke Database
    const newQuotation = await this.prisma.quotation.create({
      data: {
        quotationNumber,
        date: data.date || new Date(),
        validUntil: data.validUntil,
        status: "DRAFT", // Default status

        // Client Info
        clientId: data.clientId || null,
        manualClientName: data.manualClientName,
        manualClientCompany: data.manualClientCompany,
        manualClientEmail: data.manualClientEmail,
        manualClientPhone: data.manualClientPhone,
        manualClientAddress: data.manualClientAddress,

        // Financials
        subTotal,
        totalAmount,

        notes: data.notes,
        internalNotes: data.internalNotes,

        // Nested Create Items
        items: {
          create: itemsToCreate,
        },
      },
      include: {
        items: true,
      },
    });

    return newQuotation;
  }

  // ==========================================
  // 4. UPDATE QUOTATION
  // ==========================================
  async updateQuotation(id: string, data: UpdateQuotationDTO) {
    const existing = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) throw new ApiError("Quotation not found", 404);

    let updateData: any = { ...data };
    delete updateData.items;

    if (data.items && data.items.length > 0) {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Hapus Item Lama
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });

        // 2. Hitung Ulang Total dari Item Baru
        let newSubTotal = 0;
        const newItems = data.items!.map((item) => {
          const lineTotal =
            item.quantity * item.unitPrice - (item.discount || 0);
          newSubTotal += lineTotal;
          return {
            quotationId: id,
            productId: item.productId || null,
            productName: item.productName,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            totalPrice: lineTotal,
            customization: item.customization ?? Prisma.JsonNull,
            remarks: item.remarks,
          };
        });

        // 3. Buat Item Baru
        await tx.quotationItem.createMany({ data: newItems });

        // 4. Update Header Quotation (termasuk Total Baru)
        return await tx.quotation.update({
          where: { id },
          data: {
            ...updateData,
            subTotal: newSubTotal,
            totalAmount: newSubTotal, // + Tax jika ada logic tax
          },
          include: { items: true },
        });
      });
    } else {
      // Jika tidak ada update items, update field header saja
      return await this.prisma.quotation.update({
        where: { id },
        data: updateData,
      });
    }
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

  // ==========================================
  // 6. FOLLOW UP FEATURES
  // ==========================================

  // Tambah Follow Up Baru
  async addFollowUp(quotationId: string, data: CreateFollowUpDTO) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
    });
    if (!quotation) throw new ApiError("Quotation not found", 404);

    // Simpan Follow Up
    const followUp = await this.prisma.quotationFollowUp.create({
      data: {
        quotationId,
        date: data.date || new Date(),
        method: data.method,
        notes: data.notes,
        nextAction: data.nextAction,
      },
    });

    // Opsional: Otomatis ubah status Quotation jadi 'FOLLOW_UP' jika masih DRAFT/SENT
    if (quotation.status === "DRAFT" || quotation.status === "SENT") {
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
}
