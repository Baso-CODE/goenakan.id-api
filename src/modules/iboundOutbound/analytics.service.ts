import { differenceInDays } from "date-fns";
import { injectable } from "tsyringe";
import { PaginationService } from "../pagination/pagination.service"; // Pastikan path ini benar
import { PrismaService } from "../prisma/prisma.service";

// Tipe Query Input
interface LogisticsQuery {
  page?: number;
  take?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
}

@injectable()
export class OrderAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService, // 1. Inject PaginationService
  ) {}

  // MAIN FUNCTION: Generate Table Dashboard with Pagination
  async getOrderLogisticsSummary(query: LogisticsQuery) {
    const { page, take, search, startDate, endDate } = query;
    const where: any = {};

    // === 2. BUILD SEARCH FILTER ===
    if (search && search.trim() !== "") {
      const searchTerm = search.trim();
      where.OR = [
        // Cari berdasarkan PO Number
        { poNumber: { contains: searchTerm } },
        // Cari berdasarkan Nama Client B2B
        {
          client: {
            b2b: { companyName: { contains: searchTerm } },
          },
        },
        // Cari berdasarkan Nama Client B2C
        {
          client: {
            b2c: { name: { contains: searchTerm } },
          },
        },
      ];
    }

    // === 3. BUILD DATE FILTER ===
    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) dateFilter.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          end.setDate(end.getDate() + 1); // +1 hari agar inklusif
          dateFilter.lt = end;
        }
      }
      if (Object.keys(dateFilter).length > 0) {
        where.createdAt = dateFilter; // Atau gunakan 'dateOrder' jika ingin filter by tgl order
      }
    }

    // === 4. EXECUTE QUERY ===
    // A. Hitung Total Data (untuk Meta)
    const count = await this.prisma.order.count({ where });

    // B. Ambil Data Halaman Ini
    const orders = await this.prisma.order.findMany({
      where,
      skip: (Number(page || 1) - 1) * Number(take || 10),
      take: Number(take || 10),
      orderBy: { createdAt: "desc" }, // Order terbaru paling atas
      include: {
        productionTrackers: true,
        shipments: true,
        client: {
          select: {
            custCode: true,
            type: true,
            b2b: { select: { companyName: true } },
            b2c: { select: { name: true } },
          },
        },
      },
    });

    // === 5. MAPPING & KALKULASI (Sama seperti logic sebelumnya) ===
    const formattedData = orders.map((order) => {
      // A. Hitung Waktu Produksi
      const productionDays = order.productionTrackers.reduce((acc, tracker) => {
        if (tracker.startDate && tracker.endDate) {
          return (
            acc +
            differenceInDays(
              new Date(tracker.endDate),
              new Date(tracker.startDate),
            )
          );
        }
        if (tracker.startDate && tracker.status === "IN_PRODUCTION") {
          return (
            acc + differenceInDays(new Date(), new Date(tracker.startDate))
          );
        }
        return acc;
      }, 0);

      // B. Hitung Inbound Time
      const inboundShipments = order.shipments.filter(
        (s) => s.type === "INBOUND",
      );
      const inboundDays = this.calculateTotalDuration(inboundShipments);

      // C. Hitung Outbound Time
      const outboundShipments = order.shipments.filter(
        (s) => s.type === "OUTBOUND",
      );
      const outboundDays = this.calculateTotalDuration(outboundShipments);

      // D. Total Waktu Penyelesaian
      const totalDays = productionDays + inboundDays + outboundDays;

      // E. Tentukan Current Status
      const currentStatus = this.determineCurrentStatus(
        order.productionTrackers,
        order.shipments,
      );

      // Nama Client (Helper)
      const clientName =
        order.client.type === "B2B"
          ? order.client.b2b?.companyName
          : order.client.b2c?.name;

      return {
        orderId: order.id,
        poNumber: order.poNumber,
        clientName: clientName || "-",
        waktuPenyelesaian: `${totalDays} Hari`,
        waktuProduksi: `${productionDays} Hari`,
        inboundTime: `${inboundDays} Hari`,
        outboundTime: `${outboundDays} Hari`,
        currentStatus: currentStatus,
      };
    });

    // === 6. GENERATE META ===
    const meta = this.pagination.generateMeta({
      page: Number(page || 1),
      take: Number(take || 10),
      count,
    });

    return { data: formattedData, meta };
  }

  // --- HELPER METHODS (TIDAK BERUBAH) ---

  private calculateTotalDuration(shipments: any[]): number {
    return shipments.reduce((acc, s) => {
      if (s.departureDate && s.arrivalDate) {
        return (
          acc +
          differenceInDays(new Date(s.arrivalDate), new Date(s.departureDate))
        );
      }
      if (s.status === "DISPATCHED" && s.departureDate) {
        return acc + differenceInDays(new Date(), new Date(s.departureDate));
      }
      return acc;
    }, 0);
  }

  private determineCurrentStatus(productions: any[], shipments: any[]): string {
    const allEvents = [
      ...productions.map((p) => ({
        type: "PRODUCTION",
        date: p.updatedAt,
        status: p.status,
        meta: p,
      })),
      ...shipments.map((s) => ({
        type: "SHIPMENT",
        date: s.updatedAt,
        status: s.status,
        meta: s,
      })),
    ];

    if (allEvents.length === 0) return "Order Created";

    allEvents.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const lastEvent = allEvents[0];

    if (lastEvent.type === "PRODUCTION") {
      if (lastEvent.status === "IN_PRODUCTION") return "Sedang Produksi";
      if (lastEvent.status === "COMPLETED")
        return "Siap Dikirim (Prod Selesai)";
    }

    if (lastEvent.type === "SHIPMENT") {
      const s = lastEvent.meta;
      const destination = s.destination || "Tujuan";
      const typeLabel = s.type === "INBOUND" ? "Inbound" : "Outbound";

      if (lastEvent.status === "DISPATCHED") {
        return `${typeLabel}: OTW ke ${destination}`;
      }
      if (lastEvent.status === "ARRIVED") {
        return `${typeLabel}: Sampai di ${destination}`;
      }
    }

    return "Unknown Status";
  }
}
