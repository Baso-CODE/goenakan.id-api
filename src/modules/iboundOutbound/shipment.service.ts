import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { CreateShipmentDTO } from "./dto/createShipment.dto";
import {
  AddShipmentHistoryDTO,
  ShipmentStatus,
  UpdateShipmentInfoDTO,
} from "./dto/updateShipment.dto";

@injectable()
export class ShipmentService {
  constructor(private readonly prisma: PrismaService) {}

  // =================================================================
  // 1. CREATE SHIPMENT (Auto Start History di Origin)
  // =================================================================
  async createShipment(data: CreateShipmentDTO) {
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      select: {
        id: true,
        poNumber: true,
        client: {
          select: {
            custCode: true,
          },
        },
      },
    });

    if (!order) throw new ApiError("Order not found", 404);
    if (!order.client) throw new ApiError("Client data missing in Order", 400);

    let vendorTrackingUrl = null;
    if (data.vendorId) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: data.vendorId },
        select: { id: true, trackingUrl: true },
      });
      if (!vendor) throw new ApiError("Vendor not found", 404);
      vendorTrackingUrl = vendor.trackingUrl;
    }

    const totalShipments = await this.prisma.shipment.count();
    const sequence = String(totalShipments + 1).padStart(4, "0");

    const now = new Date();
    const year = now.getFullYear();
    const monthIndex = now.getMonth();
    const romanMonths = [
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
    const romanMonth = romanMonths[monthIndex];

    const custCode = order.client.custCode;

    const generatedDN = `DN_${sequence}_${custCode}_${romanMonth}_${year}`;

    return await this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          orderId: data.orderId,
          type: data.type,
          vendorId: data.vendorId || null,
          deliveryNoteNumber: generatedDN,
          trackingNumber: data.trackingNumber || null,
          courierLink: vendorTrackingUrl || data.courierLink || null,
          method: data.method,

          status: ShipmentStatus.DISPATCHED,
          departureDate: new Date(data.departureDate),

          origin: data.origin,
          destination: data.destination,

          items: {
            create: data.items.map((item) => ({
              orderProductId: item.orderProductId,
              quantity: item.quantity,
            })),
          },

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
        },
      });

      await tx.shipmentHistory.create({
        data: {
          shipmentId: shipment.id,
          status: ShipmentStatus.DISPATCHED,
          date: new Date(data.departureDate),
          city: data.origin,
          note: "Shipment created and dispatched",
        },
      });

      return shipment;
    });
  }

  // =================================================================
  // 2. ADD HISTORY / UPDATE STATUS (Multi-Step Logic)
  // =================================================================
  async addShipmentHistory(shipmentId: string, data: AddShipmentHistoryDTO) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) throw new ApiError("Shipment not found", 404);

    return await this.prisma.$transaction(async (tx) => {
      const history = await tx.shipmentHistory.create({
        data: {
          shipmentId: shipmentId,
          status: data.status,
          date: new Date(data.date),
          city: data.city,
          note: data.note || null,
        },
      });

      if (data.shipmentNotes && data.shipmentNotes.length > 0) {
        await tx.shipmentNote.createMany({
          data: data.shipmentNotes.flatMap((note) =>
            note.contents.map((text) => ({
              shipmentId: shipmentId,
              categoryId: note.categoryId,
              content: text,
            })),
          ),
        });
      }

      // 3. Update Status Parent (Header Shipment)
      const isFinal = [
        ShipmentStatus.ARRIVED_DESTINATION,
        ShipmentStatus.COMPLETED,
      ].includes(data.status);

      await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: data.status,
          arrivalDate: isFinal ? new Date(data.date) : undefined,
        },
      });

      return history;
    });
  }

  // =================================================================
  // 3. EDIT INFO HEADER (Tanpa nambah history)
  // Gunanya: Kalau admin typo input resi, atau mau ganti kurir
  // =================================================================
  async updateShipmentInfo(shipmentId: string, data: UpdateShipmentInfoDTO) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) throw new ApiError("Shipment not found", 404);

    return await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        trackingNumber: data.trackingNumber,
        courierLink: data.courierLink,
        deliveryNoteNumber: data.deliveryNoteNumber,
        origin: data.origin,
        destination: data.destination,
      },
    });
  }

  // =================================================================
  // 4. GET DATA (Query Updated)
  // =================================================================
  async getShipmentHistoryByOrder(orderId: string) {
    return await this.prisma.shipment.findMany({
      where: { orderId },
      include: {
        vendor: { select: { companyName: true, trackingUrl: true } },
        items: {
          include: {
            orderProduct: {
              include: { product: { select: { name: true, sku: true } } },
            },
          },
        },
        // Kita bisa include history terakhir saja jika mau irit data
        history: {
          orderBy: { date: "desc" },
          take: 1,
        },
      },
      orderBy: { departureDate: "asc" },
    });
  }

  // Get Detail Shipment (Untuk tampilan detail / Print Surat Jalan)
  async getShipmentById(id: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            sales: true,

            pic: true,
            client: {
              include: {
                b2b: { include: { department: true } },
                b2c: true,
              },
            },
          },
        },
        vendor: true,
        items: {
          include: {
            orderProduct: {
              include: {
                product: { select: { name: true, sku: true } },
                variant: { select: { variantName: true } },
              },
            },
          },
        },
        // INCLUDE HISTORY LENGKAP (Sorted Terbaru -> Terlama)
        history: {
          orderBy: { date: "desc" },
        },
        // Include Notes
        notes: {
          include: { category: true },
        },
      },
    });

    if (!shipment) throw new ApiError("Shipment not found", 404);

    return shipment;
  }
}
