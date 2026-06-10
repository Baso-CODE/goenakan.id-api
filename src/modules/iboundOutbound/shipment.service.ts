import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { CreateShipmentDTO } from "./dto/createShipment.dto";
import {
  AddShipmentHistoryDTO,
  UpdateShipmentInfoDTO,
} from "./dto/updateShipment.dto";

@injectable()
export class ShipmentService {
  constructor(private readonly prisma: PrismaService) {}

  // =================================================================
  // 1. CREATE SHIPMENT (Auto Start History di Origin)
  // =================================================================
  async createShipment(data: CreateShipmentDTO & { step: number }) {
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      select: {
        id: true,
        poNumber: true,
        client: { select: { custCode: true } },
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
      // =========================================================
      // 1. VALIDASI MULTI-STEP LOGIC SEBELUM MEMBUAT SHIPMENT
      // =========================================================
      for (const item of data.items) {
        const orderProduct = await tx.orderProduct.findUnique({
          where: { id: item.orderProductId },
          include: {
            productionTrackers: true,
            shipmentItems: { include: { shipment: true } },
          },
        });

        if (!orderProduct) throw new ApiError("Product not found", 404);

        if (data.type === "INBOUND") {
          if (data.step === 1) {
            const maxProdStep = Math.max(
              ...orderProduct.productionTrackers.map((t) => t.step),
              0,
            );
            const completedProd = orderProduct.productionTrackers
              .filter((t) => t.step === maxProdStep && t.status === "COMPLETED")
              .reduce((sum, t) => sum + t.quantity, 0);

            const currentInboundStep1 = orderProduct.shipmentItems
              .filter(
                (si) =>
                  si.shipment.type === "INBOUND" && si.shipment.step === 1,
              )
              .reduce((sum, si) => sum + si.quantity, 0);

            const allowedQty = completedProd - currentInboundStep1;
            if (item.quantity > allowedQty) {
              throw new ApiError(
                `Gagal: Kuantitas Inbound Step 1 melebihi sisa produksi yang sudah selesai (${allowedQty} pcs).`,
                400,
              );
            }
          } else {
            const arrivedPrevStep = orderProduct.shipmentItems
              .filter(
                (si) =>
                  si.shipment.type === "INBOUND" &&
                  si.shipment.step === data.step - 1 &&
                  si.shipment.status === "ARRIVED",
              )
              .reduce((sum, si) => sum + si.quantity, 0);

            const currentThisStep = orderProduct.shipmentItems
              .filter(
                (si) =>
                  si.shipment.type === "INBOUND" &&
                  si.shipment.step === data.step,
              )
              .reduce((sum, si) => sum + si.quantity, 0);

            const allowedQty = arrivedPrevStep - currentThisStep;
            if (item.quantity > allowedQty) {
              throw new ApiError(
                `Gagal: Belum bisa lanjut Inbound Step ${data.step}. Hanya ${allowedQty} pcs yang sudah sampai di titik sebelumnya.`,
                400,
              );
            }
          }
        } else if (data.type === "OUTBOUND") {
          if (data.step === 1) {
            const inboundShipments = orderProduct.shipmentItems.filter(
              (si) => si.shipment.type === "INBOUND",
            );
            const maxInboundStep =
              inboundShipments.length > 0
                ? Math.max(...inboundShipments.map((si) => si.shipment.step))
                : 0;

            const arrivedMaxInbound = inboundShipments
              .filter(
                (si) =>
                  si.shipment.step === maxInboundStep &&
                  si.shipment.status === "ARRIVED",
              )
              .reduce((sum, si) => sum + si.quantity, 0);

            const currentOutboundStep1 = orderProduct.shipmentItems
              .filter(
                (si) =>
                  si.shipment.type === "OUTBOUND" && si.shipment.step === 1,
              )
              .reduce((sum, si) => sum + si.quantity, 0);

            const allowedQty = arrivedMaxInbound - currentOutboundStep1;
            if (item.quantity > allowedQty) {
              throw new ApiError(
                `Gagal: Kuantitas Outbound Step 1 melebihi stok Inbound yang tersedia di gudang (${allowedQty} pcs).`,
                400,
              );
            }
          } else {
            const arrivedPrevStep = orderProduct.shipmentItems
              .filter(
                (si) =>
                  si.shipment.type === "OUTBOUND" &&
                  si.shipment.step === data.step - 1 &&
                  si.shipment.status === "ARRIVED",
              )
              .reduce((sum, si) => sum + si.quantity, 0);

            const currentThisStep = orderProduct.shipmentItems
              .filter(
                (si) =>
                  si.shipment.type === "OUTBOUND" &&
                  si.shipment.step === data.step,
              )
              .reduce((sum, si) => sum + si.quantity, 0);

            const allowedQty = arrivedPrevStep - currentThisStep;
            if (item.quantity > allowedQty) {
              throw new ApiError(
                `Gagal: Belum bisa lanjut Outbound Step ${data.step}. Hanya ${allowedQty} pcs yang sudah sampai di transit sebelumnya.`,
                400,
              );
            }
          }
        }
      }

      // =========================================================
      // 2. CREATE SHIPMENT & HISTORY
      // =========================================================
      const shipment = await tx.shipment.create({
        data: {
          orderId: data.orderId,
          type: data.type,
          step: data.step,
          vendorId: data.vendorId || null,
          deliveryNoteNumber: generatedDN,
          trackingNumber: data.trackingNumber || null,
          courierLink: vendorTrackingUrl || data.courierLink || null,
          method: data.method,

          status: "DISPATCHED",
          departureDate: new Date(data.departureDate),

          origin: data.origin,
          destination: data.destination,
          arrivalDate: data.arrivalDate ? new Date(data.arrivalDate) : null,

          items: {
            create: data.items.map((item) => ({
              orderProductId: item.orderProductId,
              quantity: item.quantity,
              totalCarton: item.totalCarton || 0,
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
          status: "DISPATCHED",
          date: new Date(data.departureDate),
          city: data.origin,
          note: `Shipment Step ${data.step} created and dispatched`,
        },
      });

      if (data.type === "OUTBOUND") {
        await tx.order.update({
          where: { id: data.orderId },
          data: { status: "SHIPPED" },
        });
      }

      return shipment;
    });
  }

  // =================================================================
  // 2. ADD HISTORY / UPDATE STATUS (Multi-Step Logic)
  // =================================================================
  async addShipmentHistory(shipmentId: string, data: AddShipmentHistoryDTO) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { id: true, type: true, orderId: true },
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

      await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: data.status,
          arrivalDate:
            data.status === "ARRIVED" ? new Date(data.date) : undefined,
          ...(data.trackingNumber && data.trackingNumber.trim() !== ""
            ? { trackingNumber: data.trackingNumber.trim() }
            : {}),
        },
      });

      if (shipment.type === "OUTBOUND" && data.status === "ARRIVED") {
        await tx.order.update({
          where: { id: shipment.orderId },
          data: { status: "COMPLETED" },
        });
      }

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
            invoices: {
              where: { status: { not: "CANCELLED" } },
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                invoiceNumber: true,
                totalAmount: true,
                status: true,
                category: true,
                createdAt: true,
              },
            },
            shipments: {
              where: { type: "OUTBOUND" },
              orderBy: { createdAt: "asc" },
              include: { items: true },
            },
          },
        },
        vendor: true,
        items: {
          include: {
            orderProduct: {
              include: {
                product: {
                  select: {
                    name: true,
                    sku: true,
                    description: true,
                  },
                },
                variant: {
                  select: {
                    variantName: true,
                  },
                },
              },
            },
          },
        },
        history: {
          orderBy: { date: "desc" },
        },
        notes: {
          include: { category: true },
        },
      },
    });

    if (!shipment) throw new ApiError("Shipment not found", 404);

    const outboundShipments = shipment.order.shipments;

    const currentShipmentIndex = outboundShipments.findIndex(
      (s) => s.id === id,
    );

    const previousDO =
      currentShipmentIndex > 0
        ? outboundShipments[currentShipmentIndex - 1]
        : null;

    const previousShipments =
      currentShipmentIndex > 0
        ? outboundShipments.slice(0, currentShipmentIndex)
        : [];

    const formattedItems = shipment.items.map((item: any) => {
      const orderedPcs = item.orderProduct.quantity || 0;
      const sendPcs = item.quantity || 0;
      const totalCarton = item.totalCarton || 0;

      // Hitung barang yang SUDAH DIKIRIM di DO Outbound SEBELUMNYA
      const deliveredPcs = previousShipments.reduce((total, prevShip) => {
        const matchingItem = prevShip.items.find(
          (prevItem) => prevItem.orderProductId === item.orderProductId,
        );
        return total + (matchingItem?.quantity || 0);
      }, 0);

      // Sisa yang belum dikirim (In Process)
      const inProcessPcs = Math.max(0, orderedPcs - (deliveredPcs + sendPcs));

      return {
        ...item,
        orderedPcs,
        sendPcs,
        deliveredPcs: deliveredPcs,
        inProcessPcs: inProcessPcs,
        totalCarton: totalCarton > 0 ? totalCarton : "-",
      };
    });

    return {
      ...shipment,

      items: formattedItems,

      invoiceNumbers: shipment.order.invoices.map((inv) => inv.invoiceNumber),
      invoices: shipment.order.invoices,

      previousDO: previousDO
        ? {
            id: previousDO.id,
            deliveryNoteNumber: previousDO.deliveryNoteNumber,
          }
        : null,
      isFirstShipment: currentShipmentIndex === 0,
      shipmentSequence:
        currentShipmentIndex !== -1 ? currentShipmentIndex + 1 : 0,
      totalShipments: outboundShipments.length,
    };
  }
}
