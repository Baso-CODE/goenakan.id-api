import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { ApiError } from "../../../utils/api-error";
import { CreateVendorPriceRecordDTO, UpdateVendorPriceRecordDTO } from "./supplier-cogs.dto";

@injectable()
export class SupplierCogsService {
  constructor(private readonly prisma: PrismaService) {}

  // === GET ALL RECORDS ===
  async getAllRecords(query: { productId?: string; vendorId?: string }) {
    const where: any = {};
    if (query.productId) {
      where.productId = query.productId;
    }
    if (query.vendorId) {
      where.vendorId = query.vendorId;
    }

    return this.prisma.vendorPriceRecord.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            length: true,
            width: true,
            height: true,
            weight: true,
          },
        },
        vendor: {
          select: {
            id: true,
            companyName: true,
          },
        },
        serviceVendor: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  // === GET RECORD BY ID ===
  async getRecordById(id: string) {
    const record = await this.prisma.vendorPriceRecord.findUnique({
      where: { id },
      include: {
        product: true,
        vendor: true,
        serviceVendor: true,
      },
    });

    if (!record) {
      throw new ApiError("Catatan harga supplier tidak ditemukan", 404);
    }

    return record;
  }

  // === CREATE RECORD ===
  async createRecord(data: CreateVendorPriceRecordDTO) {
    // If productId is provided, verify it exists
    if (data.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: data.productId },
      });
      if (!product) {
        throw new ApiError("Product tidak ditemukan", 400);
      }
    }

    // Verify vendor exists if provided
    if (data.vendorId) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: data.vendorId },
      });
      if (!vendor) {
        throw new ApiError("Vendor/Supplier tidak ditemukan", 400);
      }
    }

    let productIdVal = data.productId || null;
    let tempProductNameVal = data.tempProductName || null;

    if (productIdVal) {
      tempProductNameVal = null;
    } else if (tempProductNameVal) {
      productIdVal = null;
    }

    return this.prisma.vendorPriceRecord.create({
      data: {
        productId: productIdVal,
        tempProductName: tempProductNameVal,
        status: data.status || "POTENTIAL",
        calculationMode: data.calculationMode || "FIXED",
        tiers: data.tiers || null,
        vendorId: data.vendorId || null,
        serviceVendorId: data.serviceVendorId || null,
        supplierPlatform: data.supplierPlatform || null,
        supplierContactName: data.supplierContactName || null,
        supplierContactLink: data.supplierContactLink || null,
        imageUrl: data.imageUrl || null,
        imagePublicId: data.imagePublicId || null,
        foreignPrice: data.foreignPrice,
        currencyCode: data.currencyCode || "RMB",
        exchangeRate: data.exchangeRate,
        qtyPerCtn: data.qtyPerCtn ?? 1,
        length: data.length ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
        weight: data.weight ?? null,
        gzDeliveryCost: data.gzDeliveryCost ?? 0,
        localFreight: data.localFreight ?? 0,
        seaFreightRate: data.seaFreightRate ?? 10000000,
        airFreightRate: data.airFreightRate ?? 260000,
        moqCtn: data.moqCtn ?? 1,
        targetQtyPcs: data.targetQtyPcs ?? 0,
        margin: data.margin ?? 0,
        sponsorPercent: data.sponsorPercent ?? 0.02,
        roundUpTo: data.roundUpTo ?? 1000,
        importType: data.importType || "BORONGAN",
        hsCode: data.hsCode || null,
        beaMasukPercent: data.beaMasukPercent ?? 0,
        ppnPercent: data.ppnPercent ?? 11,
        pphPercent: data.pphPercent ?? 2.5,
        formECost: data.formECost ?? 0,
        insurancePercent: data.insurancePercent ?? 0,
        handlingCost: data.handlingCost ?? 0,
        otherCost: data.otherCost ?? 0,
        notes: data.notes ?? null,
      },
      include: {
        product: true,
        vendor: true,
        serviceVendor: true,
      },
    });
  }

  // === UPDATE RECORD ===
  async updateRecord(id: string, data: UpdateVendorPriceRecordDTO) {
    const record = await this.prisma.vendorPriceRecord.findUnique({
      where: { id },
    });
    if (!record) {
      throw new ApiError("Catatan harga supplier tidak ditemukan", 404);
    }

    if (data.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: data.productId },
      });
      if (!product) {
        throw new ApiError("Product tidak ditemukan", 400);
      }
    }

    if (data.vendorId) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: data.vendorId },
      });
      if (!vendor) {
        throw new ApiError("Vendor/Supplier tidak ditemukan", 400);
      }
    }

    let productIdVal: string | null | undefined = data.productId !== undefined ? data.productId : undefined;
    let tempProductNameVal: string | null | undefined = data.tempProductName !== undefined ? data.tempProductName : undefined;

    if (productIdVal) {
      tempProductNameVal = null;
    } else if (tempProductNameVal) {
      productIdVal = null;
    }

    return this.prisma.vendorPriceRecord.update({
      where: { id },
      data: {
        productId: productIdVal,
        tempProductName: tempProductNameVal,
        status: data.status !== undefined ? data.status : undefined,
        calculationMode: data.calculationMode !== undefined ? data.calculationMode : undefined,
        tiers: data.tiers !== undefined ? data.tiers : undefined,
        vendorId: data.vendorId !== undefined ? data.vendorId : undefined,
        serviceVendorId: data.serviceVendorId !== undefined ? data.serviceVendorId : undefined,
        supplierPlatform: data.supplierPlatform !== undefined ? data.supplierPlatform : undefined,
        supplierContactName: data.supplierContactName !== undefined ? data.supplierContactName : undefined,
        supplierContactLink: data.supplierContactLink !== undefined ? data.supplierContactLink : undefined,
        imageUrl: data.imageUrl !== undefined ? data.imageUrl : undefined,
        imagePublicId: data.imagePublicId !== undefined ? data.imagePublicId : undefined,
        foreignPrice: data.foreignPrice !== undefined ? data.foreignPrice : undefined,
        currencyCode: data.currencyCode !== undefined ? data.currencyCode : undefined,
        exchangeRate: data.exchangeRate !== undefined ? data.exchangeRate : undefined,
        qtyPerCtn: data.qtyPerCtn !== undefined ? data.qtyPerCtn : undefined,
        length: data.length !== undefined ? data.length : undefined,
        width: data.width !== undefined ? data.width : undefined,
        height: data.height !== undefined ? data.height : undefined,
        weight: data.weight !== undefined ? data.weight : undefined,
        gzDeliveryCost: data.gzDeliveryCost !== undefined ? data.gzDeliveryCost : undefined,
        localFreight: data.localFreight !== undefined ? data.localFreight : undefined,
        seaFreightRate: data.seaFreightRate !== undefined ? data.seaFreightRate : undefined,
        airFreightRate: data.airFreightRate !== undefined ? data.airFreightRate : undefined,
        moqCtn: data.moqCtn !== undefined ? data.moqCtn : undefined,
        targetQtyPcs: data.targetQtyPcs !== undefined ? data.targetQtyPcs : undefined,
        margin: data.margin !== undefined ? data.margin : undefined,
        sponsorPercent: data.sponsorPercent !== undefined ? data.sponsorPercent : undefined,
        roundUpTo: data.roundUpTo !== undefined ? data.roundUpTo : undefined,
        importType: data.importType !== undefined ? data.importType : undefined,
        hsCode: data.hsCode !== undefined ? data.hsCode : undefined,
        beaMasukPercent: data.beaMasukPercent !== undefined ? data.beaMasukPercent : undefined,
        ppnPercent: data.ppnPercent !== undefined ? data.ppnPercent : undefined,
        pphPercent: data.pphPercent !== undefined ? data.pphPercent : undefined,
        formECost: data.formECost !== undefined ? data.formECost : undefined,
        insurancePercent: data.insurancePercent !== undefined ? data.insurancePercent : undefined,
        handlingCost: data.handlingCost !== undefined ? data.handlingCost : undefined,
        otherCost: data.otherCost !== undefined ? data.otherCost : undefined,
        notes: data.notes !== undefined ? data.notes : undefined,
      },
      include: {
        product: true,
        vendor: true,
        serviceVendor: true,
      },
    });
  }

  // === DELETE RECORD ===
  async deleteRecord(id: string) {
    const record = await this.prisma.vendorPriceRecord.findUnique({
      where: { id },
    });
    if (!record) {
      throw new ApiError("Catatan harga supplier tidak ditemukan", 404);
    }

    await this.prisma.vendorPriceRecord.delete({
      where: { id },
    });

    return { message: "Catatan harga supplier berhasil dihapus" };
  }

  // === GET LATEST EXCHANGE RATES ===
  async getLatestRates(base: string = "RMB") {
    try {
      const apiBase = base === "RMB" ? "CNY" : base;
      const url = `https://open.er-api.com/v6/latest/${apiBase}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
      }
      const data = await response.json();
      
      const rates = { ...data.rates };
      if (base === "RMB" && rates.CNY) {
        rates.RMB = rates.CNY;
      }
      
      return {
        success: true,
        base,
        rates,
        timeLastUpdate: data.time_last_update_utc,
      };
    } catch (error: any) {
      // Fallback fallback defaults jika api down
      const fallbackRates: Record<string, Record<string, number>> = {
        RMB: { IDR: 2250, USD: 0.14, EUR: 0.13 },
        USD: { IDR: 16200, RMB: 7.25, EUR: 0.92 },
      };

      return {
        success: false,
        base,
        rates: fallbackRates[base] || { IDR: 1 },
        message: error.message || "Failed to fetch rates, returned fallback values.",
      };
    }
  }
}
