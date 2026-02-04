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
    // 1. Validasi Order (Untuk ambil PO Number)
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      select: { id: true, poNumber: true },
    });
    if (!order) throw new ApiError("Order not found", 404);

    // 2. Validasi Vendor & AMBIL TRACKING URL
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: data.vendorId },
      select: { id: true, trackingUrl: true },
    });

    if (!vendor) throw new ApiError("Vendor (Ekspedisi) not found", 404);

    // 3. Logic Auto Generate Delivery Note Number
    const totalShipments = await this.prisma.shipment.count();
    const nextSequence = totalShipments + 1;
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();

    const generatedDN = `DN/${nextSequence}/${order.poNumber}/${day}/${month}/${year}`;

    // 4. Create Shipment
    const shipment = await this.prisma.shipment.create({
      data: {
        orderId: data.orderId,
        type: data.type,
        vendorId: data.vendorId,
        deliveryNoteNumber: generatedDN,
        trackingNumber: data.trackingNumber,
        courierLink: vendor.trackingUrl || data.courierLink || null,
        method: data.method,
        status: "DISPATCHED",

        departureDate: new Date(data.departureDate),

        // --- LOGIC NOTES BARU (PENGGANTI REMARKS) ---
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

        origin: data.origin || null,
        destination: data.destination || null,

        items: {
          create: data.items.map((item) => ({
            orderProductId: item.orderProductId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: { include: { orderProduct: { include: { product: true } } } },
        notes: { include: { category: true } }, // Sertakan notes saat return
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

    // Gunakan transaksi agar update status dan penambahan notes aman
    return await this.prisma.$transaction(async (tx) => {
      // 1. Tambahkan notes baru jika ada (Append mode)
      if (data.notes && data.notes.length > 0) {
        await tx.shipmentNote.createMany({
          data: data.notes.flatMap((note) =>
            note.contents.map((text) => ({
              shipmentId: shipmentId,
              categoryId: note.categoryId,
              content: text,
            })),
          ),
        });
      }

      // 2. Update status dan tanggal sampai
      return await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: "ARRIVED",
          arrivalDate: new Date(data.arrivalDate),
        },
        include: {
          notes: {
            include: { category: true },
          },
        },
      });
    });
  }

  // 3. GET HISTORY PER ORDER
  async getShipmentHistory(orderId: string) {
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
