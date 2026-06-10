import { injectable } from "tsyringe"; // Sesuaikan jika kamu memakai Dependency Injection lain
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePurchaseOrderDTO } from "./dto/createPurchaseOrder.dto";
import { UpdatePurchaseOrderDTO } from "./dto/updatePurchaseOrder.dto";

@injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  // ====================================================================
  // HELPER: GENERATE PO NUMBER (Otomatis & Urut, contoh: PO-20240520-0001)
  // ====================================================================
  private async generatePONumber(tx: any): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const dateStr = `${year}${month}${day}`;

    const prefix = `PO-${dateStr}-`;

    const lastPO = await tx.purchaseOrder.findFirst({
      where: {
        poNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        poNumber: true,
      },
    });

    let nextIncrement = 1;

    if (lastPO && lastPO.poNumber) {
      const parts = lastPO.poNumber.split("-");
      const lastIncrementStr = parts[parts.length - 1];
      const lastIncrement = parseInt(lastIncrementStr, 10);
      if (!isNaN(lastIncrement)) {
        nextIncrement = lastIncrement + 1;
      }
    }

    // Pad angka urut menjadi 4 digit (e.g., 0001)
    const incrementStr = String(nextIncrement).padStart(4, "0");

    return `${prefix}${incrementStr}`;
  }

  // ====================================================================
  // MAIN METHOD: CREATE PURCHASE ORDER
  // ====================================================================
  async createPurchaseOrder(data: CreatePurchaseOrderDTO) {
    const { items, vendorId, createdById, ...poCore } = data;
    // 1. Validasi Vendor & Snapshot Alamat
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendor) {
      throw new ApiError(`Vendor with ID ${vendorId} not found`, 404);
    }
    const snapshotVendorAddress = vendor.address || "-";

    // 2. Kalkulasi Item dan Total Keseluruhan
    let grandTotalAmount = 0;
    const poItemsData: any[] = [];

    for (const item of items) {
      // Sesuai rule: Total Amount = qty order x unit price
      const itemTotalAmount = item.quantityOrder * item.unitPrice;
      grandTotalAmount += itemTotalAmount;

      // Siapkan relasi opsional (SO/SN & Product)
      const connectRelations: any = {};
      if (item.productId) {
        connectRelations.product = { connect: { id: item.productId } };
      }
      if (item.orderId) {
        connectRelations.order = { connect: { id: item.orderId } };
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
        ...connectRelations,
      });
    }

    // 3. Simpan ke Database menggunakan Transaction
    const newPO = await this.prisma.$transaction(async (tx) => {
      const finalPONumber =
        poCore.poNumber && poCore.poNumber.trim() !== ""
          ? poCore.poNumber
          : await this.generatePONumber(tx);

      // Siapkan relasi ke Currency
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
          // Relasi (Connect)
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
              order: true,
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
      const itemTotalAmount = item.quantityOrder * item.unitPrice;
      grandTotalAmount += itemTotalAmount;

      const connectRelations: any = {};
      if (item.productId) {
        connectRelations.product = { connect: { id: item.productId } };
      }
      if (item.orderId) {
        connectRelations.order = { connect: { id: item.orderId } };
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
        ...connectRelations,
      });
    }

    // 4. Proses Update ke Database menggunakan Transaction
    const updatedPO = await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: id },
      });

      const currencyCode = poCore.currencyCode || "IDR";

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
              order: true,
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

    // 1. Filter Pencarian Cerdas (Cari berdasarkan PO Number atau Nama Vendor)
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

        // Ambil relasi items untuk mendapatkan SO / SN Reference
        items: {
          select: {
            order: {
              select: { orderNumber: true },
            },
          },
        },
      },
    });

    // === Format Ulang Data (Data Mapping) ===
    const formattedData = purchaseOrders.map((po) => {
      const soReferences = Array.from(
        new Set(
          po.items
            .map((item) => item.order?.orderNumber)
            .filter((num) => num != null),
        ),
      );
      const referenceString =
        soReferences.length > 0 ? soReferences.join(", ") : "-";

      return {
        id: po.id,
        poDate: po.poDate,
        poNumber: po.poNumber,
        purchaseType: po.purchaseType,
        expensesCategory: po.expenseCategory,

        vendorName: po.vendor?.companyName || "-",
        vendorAddress: po.vendorAddress || "-",

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
        vendor: { select: { companyName: true, address: true } },
        currency: { select: { code: true, symbol: true } },
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        items: {
          include: {
            product: { select: { name: true } },
            order: { select: { orderNumber: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!po) throw new ApiError("Purchase Order not found", 404);

    return po;
  }
}
