import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCurrencyDTO, UpdateCurrencyDTO } from "./dto/currency.dto";

@injectable()
export class CurrencyService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // GET ALL CURRENCIES (Untuk Dropdown/List)
  // ==========================================
  async getAllCurrencies(search?: string) {
    const where = search
      ? {
          OR: [
            { code: { contains: search } }, // Case insensitive biasanya diurus Prisma config/DB
            { name: { contains: search } },
          ],
        }
      : {};

    return await this.prisma.currency.findMany({
      where,
      orderBy: {
        code: "asc", // Urutkan berdasarkan Code (IDR, USD, dll)
      },
    });
  }

  // ==========================================
  // GET ONE BY CODE
  // ==========================================
  async getCurrencyByCode(code: string) {
    const currency = await this.prisma.currency.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!currency) {
      throw new ApiError(`Currency with code '${code}' not found`, 404);
    }

    return currency;
  }

  // ==========================================
  // CREATE CURRENCY
  // ==========================================
  async createCurrency(data: CreateCurrencyDTO) {
    // 1. Cek Duplikasi (Code adalah Primary Key)
    const existing = await this.prisma.currency.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      throw new ApiError(`Currency '${data.code}' already exists.`, 400);
    }

    // 2. Simpan Data
    return await this.prisma.currency.create({
      data: {
        code: data.code,
        symbol: data.symbol,
        name: data.name,
      },
    });
  }

  // ==========================================
  // UPDATE CURRENCY
  // ==========================================
  async updateCurrency(code: string, data: UpdateCurrencyDTO) {
    // 1. Cek Eksistensi
    const existing = await this.prisma.currency.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!existing) {
      throw new ApiError(`Currency '${code}' not found`, 404);
    }

    // 2. Update Data (Code tidak bisa diubah karena PK)
    return await this.prisma.currency.update({
      where: { code: code.toUpperCase() },
      data: {
        symbol: data.symbol,
        name: data.name,
      },
    });
  }

  // ==========================================
  // DELETE CURRENCY
  // ==========================================
  async deleteCurrency(code: string) {
    const currencyCode = code.toUpperCase();

    // 1. Cek Eksistensi
    const existing = await this.prisma.currency.findUnique({
      where: { code: currencyCode },
      include: {
        _count: {
          select: {
            cashflowCosts: true,
            cashflowRevenues: true,
            cashflowSummaries: true,
          },
        },
      },
    });

    if (!existing) {
      throw new ApiError(`Currency '${code}' not found`, 404);
    }

    // 2. Cek Relasi (Safety Check)
    // Jangan hapus jika mata uang ini sudah dipakai di transaksi
    if (
      existing._count.cashflowCosts > 0 ||
      existing._count.cashflowRevenues > 0 ||
      existing._count.cashflowSummaries > 0
    ) {
      throw new ApiError(
        `Cannot delete '${currencyCode}' because it is being used in Cashflow transactions.`,
        400,
      );
    }

    // 3. Delete
    return await this.prisma.currency.delete({
      where: { code: currencyCode },
    });
  }
}
