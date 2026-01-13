import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import {
  CompleteProductionDTO,
  CreateProductionDTO,
} from "./dto/createProduction.dto";

@injectable()
export class ProductionService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. MULAI PRODUKSI
  async startProduction(data: CreateProductionDTO) {
    console.log("ini adalah data", data);

    // Validasi Order & Product
    const orderProduct = await this.prisma.orderProduct.findUnique({
      where: {
        id: data.orderProductId,
      },
    });

    if (!orderProduct || orderProduct.orderId !== data.orderId) {
      throw new ApiError("Product not found in this order", 404);
    }

    return await this.prisma.productionTracker.create({
      data: {
        orderId: data.orderId,
        orderProductId: data.orderProductId, // Disimpan ID OrderProduct (Pivot), bukan ID Product Master
        vendorId: data.vendorId,
        quantity: data.quantity,
        startDate: new Date(data.startDate),
        status: "IN_PRODUCTION",
        remarks: data.remarks,
      },
    });
  }

  // 2. SELESAI PRODUKSI
  async completeProduction(trackerId: string, data: CompleteProductionDTO) {
    const tracker = await this.prisma.productionTracker.findUnique({
      where: { id: trackerId },
    });

    if (!tracker) throw new ApiError("Production record not found", 404);

    return await this.prisma.productionTracker.update({
      where: { id: trackerId },
      data: {
        endDate: new Date(data.endDate),
        status: "COMPLETED",
        remarks: data.remarks
          ? `${tracker.remarks || ""} | ${data.remarks}`
          : tracker.remarks,
      },
    });
  }
}
