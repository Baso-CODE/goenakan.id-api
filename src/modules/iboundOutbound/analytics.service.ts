import { injectable } from "tsyringe";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";

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
    private readonly pagination: PaginationService,
  ) {}

  // Helper kalkulasi hari (Disamakan persis dengan yang di Tracking Detail)
  private diffDays(start: Date | null, end: Date | null): number {
    if (!start || !end) return 0;

    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(end);
    endDate.setHours(0, 0, 0, 0);

    const diffTime = endDate.getTime() - startDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Ditambah 1 agar inklusif
  }

  async getOrderLogisticsSummary(query: LogisticsQuery) {
    const { page, take, search, startDate, endDate } = query;
    const where: any = {};

    // 1. Filter Pencarian Cerdas (PO Number -> Order Number)
    if (search && search.trim() !== "") {
      const searchTerm = search.trim();
      where.OR = [
        { orderNumber: { contains: searchTerm } },
        { client: { b2b: { companyName: { contains: searchTerm } } } },
        { client: { b2c: { name: { contains: searchTerm } } } },
      ];
    }

    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) dateFilter.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          end.setDate(end.getDate() + 1);
          dateFilter.lt = end;
        }
      }
      if (Object.keys(dateFilter).length > 0) {
        where.createdAt = dateFilter;
      }
    }

    const count = await this.prisma.order.count({ where });

    const orders = await this.prisma.order.findMany({
      where,
      skip: (Number(page || 1) - 1) * Number(take || 10),
      take: Number(take || 10),
      orderBy: { createdAt: "desc" },
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

    const formattedData = orders.map((order) => {
      // --- KALKULASI WAKTU (Logika tetap sama) ---
      const prodStarts = order.productionTrackers
        .map((t) => t.startDate)
        .filter(Boolean) as Date[];
      const prodEnds = order.productionTrackers
        .map((t) => t.endDate)
        .filter(Boolean) as Date[];
      const prodStart = prodStarts.length
        ? new Date(Math.min(...prodStarts.map((d) => d.getTime())))
        : null;
      const isProdOngoing = order.productionTrackers.some(
        (t) => t.startDate && !t.endDate,
      );
      const prodEnd = prodEnds.length
        ? new Date(Math.max(...prodEnds.map((d) => d.getTime())))
        : isProdOngoing
          ? new Date()
          : null;
      const productionDays = this.diffDays(prodStart, prodEnd);

      const inboundShipments = order.shipments.filter(
        (s) => s.type === "INBOUND",
      );
      const inStarts = inboundShipments
        .map((s) => s.departureDate)
        .filter(Boolean) as Date[];
      const inEnds = inboundShipments
        .map((s) => s.arrivalDate)
        .filter(Boolean) as Date[];
      const inboundStart = inStarts.length
        ? new Date(Math.min(...inStarts.map((d) => d.getTime())))
        : null;
      const isInboundOngoing = inboundShipments.some(
        (s) => s.departureDate && !s.arrivalDate,
      );
      const inboundEnd = inEnds.length
        ? new Date(Math.max(...inEnds.map((d) => d.getTime())))
        : isInboundOngoing
          ? new Date()
          : null;
      const inboundDays = this.diffDays(inboundStart, inboundEnd);

      const outboundShipments = order.shipments.filter(
        (s) => s.type === "OUTBOUND",
      );
      const outStarts = outboundShipments
        .map((s) => s.departureDate)
        .filter(Boolean) as Date[];
      const outEnds = outboundShipments
        .map((s) => s.arrivalDate)
        .filter(Boolean) as Date[];
      const outboundStart = outStarts.length
        ? new Date(Math.min(...outStarts.map((d) => d.getTime())))
        : null;
      const isOutboundOngoing = outboundShipments.some(
        (s) => s.departureDate && !s.arrivalDate,
      );
      const outboundEnd = outEnds.length
        ? new Date(Math.max(...outEnds.map((d) => d.getTime())))
        : isOutboundOngoing
          ? new Date()
          : null;
      const outboundDays = this.diffDays(outboundStart, outboundEnd);

      const totalStart = prodStart || inboundStart || outboundStart;
      const totalEnd =
        outboundEnd ||
        inboundEnd ||
        prodEnd ||
        (totalStart ? new Date() : null);
      const totalDays = this.diffDays(totalStart, totalEnd);

      const currentStatus = this.determineCurrentStatus(
        order.productionTrackers,
        order.shipments,
      );
      const clientName =
        order.client.type === "B2B"
          ? order.client.b2b?.companyName
          : order.client.b2c?.name;

      return {
        orderId: order.id,
        orderNumber: order.orderNumber || "-",
        clientName: clientName || "-",
        waktuPenyelesaian: `${totalDays} Hari`,
        waktuProduksi: `${productionDays} Hari`,
        inboundTime: `${inboundDays} Hari`,
        outboundTime: `${outboundDays} Hari`,
        currentStatus: currentStatus,
      };
    });

    const meta = this.pagination.generateMeta({
      page: Number(page || 1),
      take: Number(take || 10),
      count,
    });

    return { data: formattedData, meta };
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

    if (allEvents.length === 0) return "Menunggu Produksi";

    // Urutkan dari yang terbaru (descending)
    allEvents.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // Ambil event (produksi/pengiriman) yang paling terakhir diupdate
    const lastEvent = allEvents[0];

    // --- STATUS PRODUKSI ---
    if (lastEvent.type === "PRODUCTION") {
      if (lastEvent.status === "PENDING") return "Menunggu Produksi";
      if (lastEvent.status === "IN_PRODUCTION") return "Sedang Produksi";
      if (lastEvent.status === "COMPLETED") return "Produksi Selesai";
    }

    // --- STATUS PENGIRIMAN (LOGISTICS) ---
    if (lastEvent.type === "SHIPMENT") {
      const s = lastEvent.meta;
      const status = lastEvent.status;

      if (status === "CANCELLED") return "Pengiriman Dibatalkan";

      if (s.type === "INBOUND") {
        if (status === "PENDING" || status === "PREPARED")
          return "Inbound: Disiapkan";
        if (status === "DISPATCHED") return "Inbound: OTW (Perjalanan)";
        if (status === "ARRIVED") return "Inbound: Sampai HO / Gudang";
      } else if (s.type === "OUTBOUND") {
        if (status === "PENDING" || status === "PREPARED")
          return "Outbound: Diproses";
        if (status === "DISPATCHED") return "Outbound: Perjalanan ke Client";

        // ✨ NEW: Jika Outbound sudah sampai (ARRIVED), berarti seluruh pesanan benar-benar selesai!
        if (status === "ARRIVED") return "Selesai (Diterima Client)";
      }
    }

    return "Diproses";
  }
}
