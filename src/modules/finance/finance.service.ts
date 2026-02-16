import { TransactionType } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateFinanceTransactionDTO,
  UpdateFinanceTransactionDTO,
} from "./dto/finance.dto";

@injectable()
export class FinanceTransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  // === 1. GET ALL TRANSACTIONS (Dengan Filter) ===
  async getAllTransactions(query: {
    page?: number;
    take?: number;
    startDate?: string;
    endDate?: string;
    type?: TransactionType;
    categoryId?: string;
    search?: string;
  }) {
    const where: any = {};

    // Filter Tanggal
    if (query.startDate || query.endDate) {
      where.transactionDate = {};
      if (query.startDate) {
        where.transactionDate.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setDate(end.getDate() + 1); // +1 hari agar inklusif
        where.transactionDate.lt = end;
      }
    }

    // Filter Tipe (INCOME / EXPENSE)
    if (query.type) {
      where.type = query.type;
    }

    // Filter Kategori
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    // Filter Pencarian (Deskripsi atau Reference Number)
    if (query.search) {
      where.OR = [
        { description: { contains: query.search } },
        { referenceNumber: { contains: query.search } },
      ];
    }

    // Eksekusi Query dengan Pagination
    const count = await this.prisma.financeTransaction.count({ where });

    const transactions = await this.prisma.financeTransaction.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { transactionDate: "desc" }, // Urutkan dari yang terbaru
      include: {
        category: { select: { name: true, type: true } },
        user: { select: { name: true } }, // Siapa yang mencatat
        sales: { select: { name: true } }, // Jika terkait komisi sales
      },
    });

    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 10),
    });

    return { data: transactions, meta };
  }

  // === 2. GET BY ID ===
  async getTransactionById(id: string) {
    const transaction = await this.prisma.financeTransaction.findUnique({
      where: { id },
      include: {
        category: true,
        user: { select: { name: true, email: true } },
        sales: true,
      },
    });

    if (!transaction) {
      throw new ApiError("Transaksi tidak ditemukan", 404);
    }

    return transaction;
  }

  // === 3. CREATE TRANSACTION ===
  // Perhatikan bahwa kita menerima userId dari Controller (dari token JWT)
  async createTransaction(data: CreateFinanceTransactionDTO, userId: string) {
    // Validasi apakah kategori ada
    const category = await this.prisma.financeCategory.findUnique({
      where: { id: data.categoryId },
    });

    if (!category) {
      throw new ApiError("Kategori keuangan tidak valid", 404);
    }

    // Pastikan tipe transaksi sesuai dengan tipe kategorinya (Mencegah salah input)
    if (category.type !== data.type) {
      throw new ApiError(
        `Tipe transaksi (${data.type}) tidak cocok dengan tipe kategori (${category.type})`,
        400,
      );
    }

    // Siapkan relasi opsional
    const connectRelations: any = {};
    if (data.salesId) {
      connectRelations.sales = { connect: { id: data.salesId } };
    }

    return await this.prisma.financeTransaction.create({
      data: {
        transactionDate: new Date(data.transactionDate),
        type: data.type,
        amount: data.amount,
        description: data.description,
        referenceNumber: data.referenceNumber,
        method: data.method,

        // Relasi Wajib
        category: { connect: { id: data.categoryId } },
        user: { connect: { id: userId } },

        // Relasi Opsional
        ...connectRelations,
      },
      include: {
        category: true,
      },
    });
  }

  // === 4. UPDATE TRANSACTION ===
  async updateTransaction(id: string, data: UpdateFinanceTransactionDTO) {
    const existing = await this.prisma.financeTransaction.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Transaksi tidak ditemukan", 404);
    }

    if (data.categoryId) {
      const category = await this.prisma.financeCategory.findUnique({
        where: { id: data.categoryId },
      });
      if (!category) throw new ApiError("Kategori tidak valid", 404);

      const newType = data.type || existing.type;
      if (category.type !== newType) {
        throw new ApiError(
          "Tipe transaksi tidak cocok dengan tipe kategori baru",
          400,
        );
      }
    }

    // Siapkan relasi opsional
    const updateRelations: any = {};

    if (data.categoryId) {
      updateRelations.category = { connect: { id: data.categoryId } };
    }

    if (data.salesId !== undefined) {
      if (data.salesId) {
        updateRelations.sales = { connect: { id: data.salesId } };
      } else {
        updateRelations.sales = { disconnect: true };
      }
    }

    return await this.prisma.financeTransaction.update({
      where: { id },
      data: {
        transactionDate: data.transactionDate
          ? new Date(data.transactionDate)
          : undefined,
        type: data.type,
        amount: data.amount,
        description: data.description,
        referenceNumber: data.referenceNumber,
        method: data.method,

        ...updateRelations,
      },
      include: {
        category: true,
      },
    });
  }

  // === 5. DELETE TRANSACTION ===
  async deleteTransaction(id: string) {
    const existing = await this.prisma.financeTransaction.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Transaksi tidak ditemukan", 404);
    }

    return await this.prisma.financeTransaction.delete({
      where: { id },
    });
  }
}
