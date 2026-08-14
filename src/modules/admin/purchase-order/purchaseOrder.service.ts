import { injectable } from "tsyringe"; // Sesuaikan jika kamu memakai Dependency Injection lain

import { ApiError } from "../../../utils/api-error";
import { CounterService } from "../../../utils/counter.service";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreatePurchaseOrderDTO } from "./dto/createPurchaseOrder.dto";
import { UpdatePurchaseOrderDTO } from "./dto/updatePurchaseOrder.dto";

@injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly counterService: CounterService,
  ) {}

  // ====================================================================
  // HELPER: GENERATE PO NUMBER (Aman dari Race Condition)
  // Format Baru: GI-POYYMMXXXXX (Contoh: GI-PO260700001)
  // ====================================================================
  private async generatePONumber(tx: any): Promise<string> {
    const formCode = "PO";

    // 1. Ambil periode tahun dan bulan saat ini (Contoh: "2607")
    const periodYYMM = this.counterService.getCurrentPeriodYYMM();

    // 2. Tipe counter di database: "PO_2607" agar reset setiap bulan baru
    const counterType = `${formCode}_${periodYYMM}`;

    // 3. Ambil nomor urut berikutnya secara aman dengan 5 digit angka (XXXXX)
    const sequence = await this.counterService.getNextFormattedNumber(
      tx,
      counterType,
      periodYYMM,
      5,
    );

    // 4. Gabungkan menjadi format akhir yang diminta klien
    return `GI-${formCode}${periodYYMM}${sequence}`;
  }

  // ====================================================================
  // MAIN METHOD: CREATE PURCHASE ORDER
  // ====================================================================
  async createPurchaseOrder(data: CreatePurchaseOrderDTO) {
    const { items, vendorId, createdById, ...poCore } = data;

    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendor) {
      throw new ApiError(`Vendor with ID ${vendorId} not found`, 404);
    }
    const snapshotVendorAddress = vendor.address || "-";

    let grandTotalAmount = 0;
    const poItemsData: any[] = [];

    for (const item of items) {
      const itemTotalAmount = item.quantityPurchase * item.unitPrice;
      grandTotalAmount += itemTotalAmount;

      const connectRelations: any = {};

      if (item.productId) {
        connectRelations.product = { connect: { id: item.productId } };
      }

      if (item.variantId) {
        connectRelations.variant = { connect: { id: item.variantId } };
      }

      if (item.orderId) {
        connectRelations.order = { connect: { id: item.orderId } };
      }

      // Menyambungkan Item PO ke Replacement Order jika data ID-nya dikirim
      if (item.replacementOrderId) {
        connectRelations.replacementOrder = {
          connect: { id: item.replacementOrderId },
        };
      }

      poItemsData.push({
        itemName: item.itemName,
        quantityOrder: item.quantityOrder,
        quantityStock: item.quantityStock || 0,
        quantityPurchase: item.quantityPurchase,
        uom: item.uom,
        unitPrice: item.unitPrice,
        totalAmount: itemTotalAmount,
        remarks: item.remarks || null,

        // ✨ TAMBAHAN BARU: Memasukkan selectedAttributes ke payload database
        // Jika ada datanya maka simpan sebagai JSON, jika tidak ada biarkan undefined (kosong)
        selectedAttributes: item.selectedAttributes
          ? item.selectedAttributes
          : undefined,

        ...connectRelations, // Objek penghubung dilebur ke sini secara otomatis
      });
    }

    const newPO = await this.prisma.$transaction(async (tx) => {
      const finalPONumber =
        poCore.poNumber && poCore.poNumber.trim() !== ""
          ? poCore.poNumber
          : await this.generatePONumber(tx);

      const currencyCode = poCore.currencyCode || "IDR";

      const createdPO = await tx.purchaseOrder.create({
        data: {
          poNumber: finalPONumber,
          poDate: new Date(poCore.poDate),
          purchaseType: poCore.purchaseType,
          expenseCategory: poCore.expenseCategory,
          paymentTerms: poCore.paymentTerms,
          status: "DRAFT",
          notes: poCore.notes || null,
          totalAmount: grandTotalAmount,
          vendorAddress: snapshotVendorAddress,
          vendor: { connect: { id: vendorId } },
          currency: { connect: { code: currencyCode } },
          createdBy: createdById ? { connect: { id: createdById } } : undefined,
          items: {
            create: poItemsData,
          },
        },
        include: {
          vendor: true,
          currency: true,
          items: {
            include: {
              product: true,
              variant: true,
              order: true,
              replacementOrder: true,
            },
          },
        },
      });

      return createdPO;
    });

    return newPO;
  }

  // ====================================================================
  // UPDATE METHOD: EDIT PURCHASE ORDER
  // ====================================================================
  async updatePurchaseOrder(id: string, data: UpdatePurchaseOrderDTO) {
    const { items, vendorId, ...poCore } = data;

    // 1. Cek apakah PO yang dimaksud ada
    const existingPO = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existingPO) {
      throw new ApiError(`Purchase Order with ID ${id} not found`, 404);
    }

    if (
      existingPO.status === "COMPLETED" ||
      existingPO.status === "CANCELLED"
    ) {
      throw new ApiError(
        `Purchase Order tidak dapat diedit karena sudah berstatus ${existingPO.status}.`,
        400,
      );
    }

    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendor) {
      throw new ApiError(`Vendor with ID ${vendorId} not found`, 404);
    }
    const snapshotVendorAddress = vendor.address || "-";

    // 3. Kalkulasi Ulang Item dan Total Keseluruhan
    let grandTotalAmount = 0;
    const poItemsData: any[] = [];

    for (const item of items) {
      const itemTotalAmount = item.quantityPurchase * item.unitPrice;
      grandTotalAmount += itemTotalAmount;

      const connectRelations: any = {};
      if (item.productId) {
        connectRelations.product = { connect: { id: item.productId } };
      }

      if (item.variantId) {
        connectRelations.variant = { connect: { id: item.variantId } };
      }

      if (item.orderId) {
        connectRelations.order = { connect: { id: item.orderId } };
      }

      if (item.replacementOrderId) {
        connectRelations.replacementOrder = {
          connect: { id: item.replacementOrderId },
        };
      }

      poItemsData.push({
        itemName: item.itemName,
        quantityOrder: item.quantityOrder,
        quantityStock: item.quantityStock || 0,
        quantityPurchase: item.quantityPurchase,
        uom: item.uom,
        unitPrice: item.unitPrice,
        totalAmount: itemTotalAmount,
        remarks: item.remarks || null,

        // ✨ TAMBAHAN BARU: Memastikan varian tersimpan saat diedit
        selectedAttributes: item.selectedAttributes
          ? item.selectedAttributes
          : undefined,

        ...connectRelations,
      });
    }

    // 4. Proses Update ke Database menggunakan Transaction
    const updatedPO = await this.prisma.$transaction(async (tx) => {
      // Menghapus item lama
      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: id },
      });

      const currencyCode = poCore.currencyCode || "IDR";

      // Membuat ulang data PO beserta item barunya
      const po = await tx.purchaseOrder.update({
        where: { id },
        data: {
          poDate: new Date(poCore.poDate),
          purchaseType: poCore.purchaseType,
          expenseCategory: poCore.expenseCategory,
          paymentTerms: poCore.paymentTerms,
          notes: poCore.notes || null,
          totalAmount: grandTotalAmount,
          vendorAddress: snapshotVendorAddress,
          vendor: { connect: { id: vendorId } },
          currency: { connect: { code: currencyCode } },
          items: {
            create: poItemsData,
          },
        },
        include: {
          vendor: true,
          currency: true,
          items: {
            include: {
              product: true,
              variant: true,
              order: true,
              replacementOrder: true,
            },
          },
        },
      });

      return po;
    });

    return updatedPO;
  }

  // ====================================================================
  // GET ALL PURCHASE ORDERS (WITH FILTER, SEARCH, & PAGINATION)
  // ====================================================================
  async getAllPurchaseOrders(query: {
    page?: number;
    take?: number;
    search?: string;
    purchaseType?: string;
    expenseCategory?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const where: any = {};

    if (query.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { poNumber: { contains: searchTerm } },
        {
          vendor: { is: { companyName: { contains: searchTerm } } },
        },
      ];
    }

    // 2. Filter Kategori & Tipe
    if (query.purchaseType) where.purchaseType = query.purchaseType;
    if (query.expenseCategory) where.expenseCategory = query.expenseCategory;
    if (query.status) where.status = query.status;

    // 3. Filter Tanggal (Berdasarkan poDate)
    if (query.startDate || query.endDate) {
      const dateFilter: any = {};
      if (query.startDate) {
        const start = new Date(query.startDate);
        if (!isNaN(start.getTime())) dateFilter.gte = start;
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        if (!isNaN(end.getTime())) {
          end.setDate(end.getDate() + 1);
          dateFilter.lt = end;
        }
      }
      if (Object.keys(dateFilter).length > 0) {
        where.poDate = dateFilter;
      }
    }

    // === Query Database ===
    const count = await this.prisma.purchaseOrder.count({ where });

    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { createdAt: "desc" }, // Urutkan dari yang terbaru dibuat
      include: {
        vendor: { select: { companyName: true } },
        currency: { select: { symbol: true } },

        // Audit & Approval Trails
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },

        items: {
          select: {
            order: {
              select: { orderNumber: true },
            },
            replacementOrder: {
              select: { replacementNumber: true },
            },
          },
        },
      },
    });

    // === Format Ulang Data (Data Mapping) ===
    const formattedData = purchaseOrders.map((po) => {
      // ✨ TAMBAHAN BARU: Mengumpulkan referensi dari SO Reguler dan Replacement Order
      const rawReferences = po.items
        .map((item) => {
          const refs = [];
          if (item.order?.orderNumber) refs.push(item.order.orderNumber);
          if (item.replacementOrder?.replacementNumber)
            refs.push(item.replacementOrder.replacementNumber);
          return refs;
        })
        .flat(); // Gabungkan array di dalam array menjadi satu daftar panjang

      // Hapus data yang kosong/null dan jadikan unik (agar tidak ada duplikat)
      const validReferences = rawReferences.filter(Boolean);
      const uniqueReferences = Array.from(new Set(validReferences));

      const referenceString =
        uniqueReferences.length > 0 ? uniqueReferences.join(", ") : "-";

      return {
        id: po.id,
        poDate: po.poDate,
        poNumber: po.poNumber,
        purchaseType: po.purchaseType,
        expensesCategory: po.expenseCategory,

        vendorName: po.vendor?.companyName || "-",
        vendorAddress: po.vendorAddress || "-",

        // Masukkan referensi gabungan ke sini
        salesOrderReference: referenceString,
        currency: po.currencyCode,
        totalAmount: Number(po.totalAmount),

        status: po.status,
        approvalStatus:
          po.status === "APPROVED" ||
          po.status === "COMPLETED" ||
          po.status === "SENT"
            ? "Approved"
            : po.status,

        approveBy: po.approvedBy?.name || "-",
        approvalDate: po.approvalDate || null,

        // Audit Trails
        createdBy: po.createdBy?.name || "System",
        createdTime: po.createdAt,
        updatedBy: po.updatedBy?.name || "-",
        updatedTime: po.updatedAt,
      };
    });

    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 10),
    });

    return { data: formattedData, meta };
  }

  // ====================================================================
  // GET ALL PURCHASE ORDERS BY ID
  // ====================================================================
  async getPurchaseOrderById(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        vendor: {
          select: {
            companyName: true,
            picName: true,
            // Mengambil semua pecahan alamat:
            address: true,
            subDistrict: true,
            district: true,
            city: true,
            province: true,
            country: true,
            postalCode: true,
            // Memanggil relasi platform di dalam contacts:
            contacts: {
              include: {
                platform: true,
              },
            },
          },
        },
        currency: { select: { code: true, symbol: true } },
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        items: {
          include: {
            product: { select: { name: true } },
            variant: true,
            order: { select: { orderNumber: true } },
            replacementOrder: { select: { replacementNumber: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!po) throw new ApiError("Purchase Order not found", 404);

    return po;
  }
}
