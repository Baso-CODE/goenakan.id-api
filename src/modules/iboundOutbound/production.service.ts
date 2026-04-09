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

  // 1. MULAI PRODUKSI DENGAN VALIDASI TAHAP (STEP)
  async startProduction(data: CreateProductionDTO & { step: number }) {
    const orderProduct = await this.prisma.orderProduct.findUnique({
      where: { id: data.orderProductId },
      include: { productionTrackers: true },
    });

    if (!orderProduct || orderProduct.orderId !== data.orderId) {
      throw new ApiError("Product not found in this order", 404);
    }

    const trackers = orderProduct.productionTrackers;

    if (data.step === 1) {
      // TAHAP 1: Cek apakah total kuantitas Tahap 1 melebihi jumlah pesanan
      const totalStep1 = trackers
        .filter((t) => t.step === 1)
        .reduce((sum, t) => sum + t.quantity, 0);

      const allowedQty = orderProduct.quantity - totalStep1;

      if (data.quantity > allowedQty) {
        throw new ApiError(
          `Kuantitas Tahap 1 melebihi batas pesanan! Sisa kuantitas yang bisa diproses di tahap ini hanya ${allowedQty} pcs.`,
          400,
        );
      }
    } else {
      // TAHAP LANJUTAN (Step 2, 3, dst):
      // Syarat: Hanya boleh mengambil sejumlah qty yang sudah COMPLETED di Tahap sebelumnya (step - 1)
      const completedPrevStep = trackers
        .filter((t) => t.step === data.step - 1 && t.status === "COMPLETED")
        .reduce((sum, t) => sum + t.quantity, 0);

      const totalCurrentStep = trackers
        .filter((t) => t.step === data.step)
        .reduce((sum, t) => sum + t.quantity, 0);

      const allowedQty = completedPrevStep - totalCurrentStep;

      if (data.quantity > allowedQty) {
        throw new ApiError(
          `Belum bisa lanjut ke Tahap ${data.step}! Hanya ada ${allowedQty} pcs yang sudah berstatus 'Selesai' di Tahap ${data.step - 1}. Selesaikan dulu produksi sebelumnya.`,
          400,
        );
      }
    }

    // Jika lolos validasi, buat riwayat produksinya
    return await this.prisma.productionTracker.create({
      data: {
        orderId: data.orderId,
        orderProductId: data.orderProductId,
        vendorId: data.vendorId,
        step: data.step,
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
