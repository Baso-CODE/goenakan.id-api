import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { CounterService } from "../../../utils/counter.service";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateReplacementOrderDTO,
  UpdateReplacementOrderDTO,
} from "./dto/replacement-order.dto";

@injectable()
export class ReplacementOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly counterService: CounterService,
  ) {}

  async createReplacementOrder(
    data: CreateReplacementOrderDTO,
    userId: string,
  ) {
    const { items, ...coreData } = data;

    const replacementItems = items.map((item) => {
      return {
        product: { connect: { id: item.productId } },
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? 0,
        selectedAttributes: item.selectedAttributes
          ? item.selectedAttributes
          : undefined,
        variant: item.variantId
          ? { connect: { id: item.variantId } }
          : undefined,
        customization: item.customization || undefined,
        remarks: item.remarks || undefined,
      };
    });

    // Jalankan Prisma Transaction
    const newReplacement = await this.prisma.$transaction(async (tx) => {
      // 1. Ambil periode saat ini (Contoh: "2607")
      const periodYYMM = this.counterService.getCurrentPeriodYYMM();

      // 2. Ambil urutan terakhir untuk 'RN' bulan ini, dengan panjang 5 digit
      const sequence = await this.counterService.getNextFormattedNumber(
        tx,
        "RN",
        periodYYMM,
        5,
      );

      // 3. Gabungkan format RN (GI-RNYYMMXXXXX) -> Contoh: GI-RN260700001
      const generatedRN = `GI-RN${periodYYMM}${sequence}`;

      const connectRelations: any = {};
      if (coreData.clientB2BPICId)
        connectRelations.pic = { connect: { id: coreData.clientB2BPICId } };
      if (userId) connectRelations.createdBy = { connect: { id: userId } };

      // 4. Simpan ke Database
      const replacement = await tx.replacementOrder.create({
        data: {
          replacementNumber: generatedRN,
          referenceOrder: { connect: { id: coreData.referenceOrderId } },
          client: { connect: { id: coreData.clientId } },
          replacementReason: coreData.replacementReason,
          remarks: coreData.remarks || null,
          ...connectRelations,
          items: { create: replacementItems },
        },
        include: {
          items: { include: { product: true, variant: true } },
          client: true,
          referenceOrder: true,
        },
      });

      return replacement;
    });

    return newReplacement;
  }

  async updateReplacementOrder(
    id: string,
    data: UpdateReplacementOrderDTO,
    userId: string,
  ) {
    const existingOrder = await this.prisma.replacementOrder.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      throw new ApiError("Replacement Order tidak ditemukan", 404);
    }

    const { items, ...coreData } = data;
    const updatedReplacement = await this.prisma.$transaction(async (tx) => {
      await tx.replacementOrder.update({
        where: { id },
        data: {
          replacementReason: coreData.replacementReason,
          remarks: coreData.remarks,
          sendToCustDate: coreData.sendToCustDate
            ? new Date(coreData.sendToCustDate)
            : undefined,
          arrivalInCustDate: coreData.arrivalInCustDate
            ? new Date(coreData.arrivalInCustDate)
            : undefined,
          updatedBy: { connect: { id: userId } },
        },
      });

      if (items && items.length > 0) {
        await tx.replacementOrderProduct.deleteMany({
          where: { replacementOrderId: id },
        });
        const replacementItems = items.map((item) => ({
          replacementOrderId: id,
          productId: item.productId,
          variantId: item.variantId || undefined,
          quantity: item.quantity,
          unitPrice: item.unitPrice ?? 0,
          selectedAttributes: item.selectedAttributes
            ? item.selectedAttributes
            : undefined,
          customization: item.customization || undefined,
          remarks: item.remarks || undefined,
        }));

        await tx.replacementOrderProduct.createMany({
          data: replacementItems,
        });
      }
      return tx.replacementOrder.findUnique({
        where: { id },
        include: {
          items: {
            include: { product: true, variant: true },
          },
          client: true,
          referenceOrder: true,
        },
      });
    });

    return updatedReplacement;
  }

  async getAllReplacementOrders(query: {
    page?: number;
    take?: number;
    search?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const where: any = {};

    // 1. Filter Pencarian (Search)
    if (query.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { replacementNumber: { contains: searchTerm } },
        { referenceOrder: { is: { orderNumber: { contains: searchTerm } } } },
        {
          client: {
            b2b: { is: { companyName: { contains: searchTerm } } },
          },
        },
        {
          client: {
            b2c: { is: { name: { contains: searchTerm } } },
          },
        },
        {
          pic: { is: { name: { contains: searchTerm } } },
        },
        {
          createdBy: { is: { name: { contains: searchTerm } } },
        },
      ];
    }

    // 2. Filter Tanggal (berdasarkan replacementDate)
    if (query.startDate || query.endDate) {
      const dateFilter: any = {};

      if (query.startDate) {
        const start = new Date(query.startDate);
        if (!isNaN(start.getTime())) dateFilter.gte = start;
      }

      if (query.endDate) {
        const end = new Date(query.endDate);
        if (!isNaN(end.getTime())) {
          // Tambahkan 1 hari agar mencakup perhitungan hingga jam 23:59:59 di tanggal akhir
          end.setDate(end.getDate() + 1);
          dateFilter.lt = end;
        }
      }

      if (Object.keys(dateFilter).length > 0) {
        where.replacementDate = dateFilter;
      }
    }

    // === Query Database ===
    // Hitung total data sesuai filter untuk meta paginasi
    const count = await this.prisma.replacementOrder.count({ where });

    const replacements = await this.prisma.replacementOrder.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          include: {
            b2c: true,
            b2b: {
              include: { pics: { select: { name: true } } },
            },
          },
        },
        pic: { select: { name: true } }, // PIC Customer (Khusus B2B)
        createdBy: { select: { name: true } }, // Admin yang membuat form
        updatedBy: { select: { name: true } },
        referenceOrder: { select: { orderNumber: true } }, // SO/SN asli
        _count: {
          select: { items: true }, // Menghitung total macam barang yang di-retur
        },
      },
    });

    // === Format Ulang Data (Data Mapping) ===
    const formattedData = replacements.map((rep) => {
      let clientName = "-";
      let picCustomer: string | null = null;

      // Logika Penamaan Kustomer dan PIC
      if (rep.client?.b2b) {
        clientName = rep.client.b2b.companyName;
        picCustomer =
          rep.pic?.name ||
          (rep.client.b2b.pics && rep.client.b2b.pics.length > 0
            ? rep.client.b2b.pics[0].name
            : "-");
      } else if (rep.client?.b2c) {
        clientName = rep.client.b2c.name;
        picCustomer = null;
      }

      return {
        id: rep.id,
        replacementDate: rep.replacementDate,
        replacementNumber: rep.replacementNumber || "-",
        referenceOrderNumber: rep.referenceOrder?.orderNumber || "-",

        customerName: clientName,
        picCustomer: picCustomer,

        replacementReason: rep.replacementReason || "-",
        remarks: rep.remarks || "-",

        sendToCustDate: rep.sendToCustDate || null,
        arrivalInCustDate: rep.arrivalInCustDate || null,

        createdBy: rep.createdBy?.name || "System",
        createdTime: rep.createdAt,
        updatedBy: rep.updatedBy?.name || "-",
        updatedTime: rep.updatedAt,

        totalItems: rep._count.items,
      };
    });

    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 10),
    });

    return { data: formattedData, meta };
  }

  // ==========================================
  // GET REPLACEMENT ORDER BY ID (UNTUK EDIT)
  // ==========================================
  async getReplacementOrderById(id: string) {
    const replacementOrder = await this.prisma.replacementOrder.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!replacementOrder) {
      throw new ApiError(`Replacement Order with ID ${id} not found`, 404);
    }

    return replacementOrder;
  }
}
