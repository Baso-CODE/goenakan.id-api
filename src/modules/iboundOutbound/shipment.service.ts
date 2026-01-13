import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { CreateShipmentDTO } from "./dto/createShipment.dto";
import { MarkShipmentArrivedDTO } from "./dto/updateShipment.dto";

@injectable()
export class ShipmentService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. INPUT MANUAL ADMIN (Buat Shipment/Resi Baru)
  async createShipment(data: CreateShipmentDTO) {
    // Validasi dasar order
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
    });
    if (!order) throw new ApiError("Order not found", 404);

    // Create Transaction: Header + Items
    const shipment = await this.prisma.shipment.create({
      data: {
        orderId: data.orderId,
        type: data.type, // INBOUND / OUTBOUND
        vendorId: data.vendorId,

        // Tracking Info
        trackingNumber: data.trackingNumber,
        courierLink: data.courierLink,
        method: data.method,

        // Route & Time
        origin: data.origin,
        destination: data.destination,
        departureDate: new Date(data.departureDate),
        status: "DISPATCHED", // Default langsung 'OTW' saat diinput
        remarks: data.remarks,

        // === PARTIAL SHIPMENT LOGIC ===
        // Memasukkan array item yang dipilih admin ke tabel shipment_items
        items: {
          create: data.items.map((item) => ({
            orderProductId: item.orderProductId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: { include: { orderProduct: { include: { product: true } } } },
      },
    });

    return shipment;
  }

  // 2. UPDATE STATUS SAMPAI (ARRIVED)
  async markShipmentArrived(shipmentId: string, data: MarkShipmentArrivedDTO) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) throw new ApiError("Shipment not found", 404);

    return await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: "ARRIVED",
        arrivalDate: new Date(data.arrivalDate),
        remarks: data.remarks
          ? `${shipment.remarks || ""} | ${data.remarks}`
          : shipment.remarks,
      },
    });
  }

  // 3. GET HISTORY PER ORDER (Untuk Timeline View Detail Order)
  async getShipmentHistory(orderId: string) {
    return await this.prisma.shipment.findMany({
      where: { orderId },
      include: {
        vendor: { select: { companyName: true } },
        items: {
          include: {
            orderProduct: {
              include: { product: { select: { name: true, sku: true } } },
            },
          },
        },
      },
      orderBy: { departureDate: "asc" }, // Urutkan dari yang paling awal berangkat
    });
  }
}
