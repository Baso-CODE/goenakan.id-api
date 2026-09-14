import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";

// Interface untuk menampung query dari Frontend
export interface SampleHistoryQuery {
  page?: number;
  take?: number;
  search?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

@injectable()
export class SampleHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  // ====================================================================
  // 1. GET ALL SAMPLE HISTORY (Dengan Pagination & Filter)
  // ====================================================================
  async getAllSampleHistory(query: SampleHistoryQuery) {
    const where: any = {};

    // A. Filter Pencarian (Search)
    if (query.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { order: { orderNumber: { contains: searchTerm } } },
        { product: { name: { contains: searchTerm } } }, // Mencari nama produk
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
      ];
    }

    // B. Filter Status (ORDER_SAMPLE_CREATE, SENDING, RECEIVE, RETURNED)
    if (query.status && query.status !== "ALL") {
      where.status = query.status;
    }

    // C. Filter Tanggal
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
        where.date = dateFilter;
      }
    }

    // === Eksekusi Query Database ===
    const count = await this.prisma.sampleProductHistory.count({ where });

    const histories = await this.prisma.sampleProductHistory.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { date: "desc" }, // Urutkan dari yang paling baru
      include: {
        product: { select: { id: true, name: true, sku: true } },
        order: { select: { id: true, orderNumber: true } },
        client: {
          include: {
            b2b: { select: { companyName: true } },
            b2c: { select: { name: true } },
          },
        },
      },
    });

    // === Format Ulang Data (Data Mapping) ===
    const formattedData = histories.map((history) => {
      // Menentukan nama klien (B2B atau B2C)
      let clientName = "-";
      if (history.client?.b2b) {
        clientName = history.client.b2b.companyName;
      } else if (history.client?.b2c) {
        clientName = history.client.b2c.name;
      }

      return {
        id: history.id,
        orderId: history.order?.id,
        date: history.date,
        status: history.status,
        notes: history.notes || "-",
        orderNumber: history.order?.orderNumber || "-",
        clientName: clientName,
        productName: history.product?.name || "-",
        productSku: history.product?.sku || "-",
      };
    });

    // === Generate Metadata Pagination ===
    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 10),
    });

    return { data: formattedData, meta };
  }

  // ====================================================================
  // 2. TRIGGER MANUAL: MARK AS RETURNED
  // ====================================================================
  async markSampleAsReturned(orderId: string, notes?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        products: { include: { product: true } },
      },
    });

    if (!order) {
      throw new ApiError("Order tidak ditemukan", 404);
    }

    if (order.salesCategory !== "SAMPLE") {
      throw new ApiError("Aksi ditolak: Order ini bukan pesanan sampel.", 400);
    }

    const sampleHistoryData: any[] = [];

    // Hanya ambil produk yang bertipe isSample === true
    for (const item of order.products) {
      if (item.product.isSample) {
        sampleHistoryData.push({
          productId: item.productId,
          orderId: order.id,
          clientId: order.clientId,
          status: "RETURNED",
          date: new Date(),
          notes: notes || "Barang sampel telah dikembalikan ke gudang",
        });
      }
    }

    if (sampleHistoryData.length === 0) {
      throw new ApiError(
        "Tidak ada produk bertipe sample di dalam pesanan ini.",
        400,
      );
    }

    // Simpan ke database
    return await this.prisma.$transaction(async (tx) => {
      await tx.sampleProductHistory.createMany({
        data: sampleHistoryData,
      });

      // Update status Order menjadi COMPLETED karena sampel sudah selesai dipinjam
      await tx.order.update({
        where: { id: orderId },
        data: { status: "COMPLETED" },
      });

      return {
        success: true,
        message: "Status sampel berhasil diperbarui menjadi RETURNED",
      };
    });
  }

  // ====================================================================
  // 3. GET SAMPLE SUMMARY (Bonus untuk Dashboard/Laporan)
  // ====================================================================
  async getSampleSummary() {
    // Mencari 1 status terbaru untuk setiap kombinasi Order & Produk
    // Karena Prisma belum mendukung fitur 'DISTINCT ON' secara sempurna,
    // kita menggunakan query raw sederhana atau mengambil semua lalu kita filter.

    // Ambil data status yang menunjukkan barang masih di luar (RECEIVE/SENDING)
    // dan barang yang sudah di dalam (RETURNED)
    const totalReturned = await this.prisma.sampleProductHistory.count({
      where: { status: "RETURNED" },
    });

    const totalSending = await this.prisma.sampleProductHistory.count({
      where: { status: "SENDING" },
    });

    const totalReceivedByClient = await this.prisma.sampleProductHistory.count({
      where: { status: "RECEIVE" },
    });

    return {
      success: true,
      data: {
        atWarehouse: totalReturned,
        inTransit: totalSending,
        atClient: totalReceivedByClient,
      },
      message:
        "Perhitungan ini didasarkan pada total aktivitas (bukan unit absolut).",
    };
  }

  // ====================================================================
  // 4. GET SAMPLE HISTORY DETAIL BY ID
  // ====================================================================
  async getSampleHistoryById(id: string) {
    const history = await this.prisma.sampleProductHistory.findUnique({
      where: { id },
      include: {
        product: {
          select: { id: true, name: true, sku: true, basePrice: true },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            dateOrder: true,
            status: true,
            shippingAddress: true,
          },
        },
        client: {
          include: {
            // ✨ Dihapus 'email' karena ClientB2C di schema tidak memilikinya
            b2b: { select: { companyName: true, phone: true, email: true } },
            b2c: { select: { name: true, phone: true } },
          },
        },
      },
    });

    if (!history) {
      throw new ApiError("Riwayat sampel tidak ditemukan", 404);
    }

    // Format data untuk merapikan nama klien
    let clientInfo: any = { name: "-", phone: "-", email: "-" };

    // Menggunakan optional chaining yang aman untuk TypeScript
    const clientData = history.client;
    if (clientData?.b2b) {
      clientInfo = {
        name: clientData.b2b.companyName,
        phone: clientData.b2b.phone || "-",
        email: clientData.b2b.email || "-",
      };
    } else if (clientData?.b2c) {
      clientInfo = {
        name: clientData.b2c.name,
        phone: clientData.b2c.phone || "-",
        email: "-", // ClientB2C tidak menyimpan email di schema
      };
    }

    return {
      success: true,
      data: {
        id: history.id,
        date: history.date,
        status: history.status,
        notes: history.notes || "-",
        order: history.order,
        client: clientInfo,
        product: history.product,
      },
    };
  }
}
