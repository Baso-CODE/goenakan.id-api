import { TransactionType } from "@prisma/client";
import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateFinanceCategoryDTO,
  UpdateFinanceCategoryDTO,
} from "./dto/categoryFinance.dto";

@injectable()
export class FinanceCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  }

  // === GET ALL CATEGORIES ===
  async getAllCategories(query?: {
    type?: TransactionType;
    isActive?: boolean;
  }) {
    const where: any = {};
    if (query?.type) where.type = query.type;
    if (query?.isActive !== undefined) where.isActive = query.isActive;

    return await this.prisma.financeCategory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { transactions: true },
        },
      },
    });
  }

  // === GET BY ID ===
  async getCategoryById(id: string) {
    const category = await this.prisma.financeCategory.findUnique({
      where: { id },
    });

    if (!category) {
      throw new ApiError("Kategori keuangan tidak ditemukan", 404);
    }

    return category;
  }

  // === CREATE ===
  async createCategory(data: CreateFinanceCategoryDTO) {
    const slug = this.generateSlug(data.name);

    // Cek apakah nama atau slug sudah ada (karena unique di DB)
    const existing = await this.prisma.financeCategory.findFirst({
      where: {
        OR: [{ name: data.name }, { slug: slug }],
      },
    });

    if (existing) {
      throw new ApiError("Nama atau Slug kategori sudah digunakan", 400);
    }

    return await this.prisma.financeCategory.create({
      data: {
        name: data.name,
        slug: slug,
        type: data.type,
        description: data.description || null,
        // isActive default dari Prisma adalah true
      },
    });
  }

  // === UPDATE ===
  async updateCategory(id: string, data: UpdateFinanceCategoryDTO) {
    const existing = await this.prisma.financeCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Kategori tidak ditemukan", 404);
    }

    let newSlug = existing.slug;

    if (data.name && data.name !== existing.name) {
      newSlug = this.generateSlug(data.name);
      const duplicate = await this.prisma.financeCategory.findFirst({
        where: {
          slug: newSlug,
          NOT: { id: id },
        },
      });

      if (duplicate) {
        throw new ApiError(
          "Nama kategori menghasilkan slug yang sudah terpakai",
          400,
        );
      }
    }

    return await this.prisma.financeCategory.update({
      where: { id },
      data: {
        name: data.name,
        slug: newSlug,
        type: data.type,
        description: data.description,
        isActive: data.isActive,
      },
    });
  }

  // === DELETE ===
  async deleteCategory(id: string) {
    const category = await this.prisma.financeCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { transactions: true },
        },
      },
    });

    if (!category) {
      throw new ApiError("Kategori tidak ditemukan", 404);
    }

    if (category._count.transactions > 0) {
      throw new ApiError(
        "Kategori tidak bisa dihapus karena sudah ada data transaksi yang menggunakan kategori ini. Silakan ubah status menjadi Inactive (Tidak Aktif) saja.",
        400,
      );
    }

    return await this.prisma.financeCategory.delete({
      where: { id },
    });
  }
}
