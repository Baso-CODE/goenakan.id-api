import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { CreateShipmentDTO } from "./dto/createShipment.dto";
import { MarkShipmentArrivedDTO } from "./dto/updateShipment.dto";

@injectable()
export class ShipmentService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. INPUT MANUAL ADMIN (Buat Shipment/Resi Baru + Auto Generate Surat Jalan)
  async createShipment(data: CreateShipmentDTO) {
    // A. Validasi Order & Ambil Data untuk Format Nomor
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      select: { id: true, poNumber: true }, // Ambil PO Number agar surat jalan rapi
    });

    if (!order) throw new ApiError("Order not found", 404);

    // B. Logic Auto Generate Delivery Note Number
    // Format: DN/Sequence/PO/DD/MM/YYYY
    // Contoh: DN/15/PO-202601-001/14/01/2026

    // 1. Hitung jumlah shipment yang sudah ada untuk mendapatkan nomor urut (Sequence)
    const totalShipments = await this.prisma.shipment.count();
    const nextSequence = totalShipments + 1;

    // 2. Ambil Tanggal Hari Ini
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();

    // 3. Susun Format String
    // Jika Anda benar-benar ingin UUID order, ganti `order.poNumber` dengan `order.id`
    // Tapi saran saya gunakan PO Number agar mudah dibaca manusia.
    const generatedDN = `DN/${nextSequence}/${order.poNumber}/${day}/${month}/${year}`;

    // C. Create Transaction: Header + Items
    const shipment = await this.prisma.shipment.create({
      data: {
        orderId: data.orderId,
        type: data.type, // INBOUND / OUTBOUND
        vendorId: data.vendorId,

        // === [AUTO GENERATED FIELD] ===
        deliveryNoteNumber: generatedDN,
        // ==============================

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

  // 3. GET HISTORY PER ORDER
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
      orderBy: { departureDate: "asc" },
    });
  }

  async getShipmentById(id: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: {
        // 1. Ambil Data Order & Client (Penting untuk Header Invoice/SJ)
        order: {
          include: {
            sales: true, // Untuk Tanda Tangan / Sales Rep
            client: {
              include: {
                b2b: { include: { department: true } }, // Jika butuh detail dept
                b2c: true,
              },
            },
          },
        },

        // 2. Ambil Data Vendor (Ekspedisi)
        vendor: true,

        // 3. Ambil Item Detail (Penting untuk Baris Invoice)
        items: {
          include: {
            orderProduct: {
              include: {
                product: { select: { name: true, sku: true } },
                variant: { select: { variantName: true } }, // Master Variant
              },
            },
          },
        },
      },
    });

    if (!shipment) throw new ApiError("Shipment not found", 404);

    return shipment;
  }
}
