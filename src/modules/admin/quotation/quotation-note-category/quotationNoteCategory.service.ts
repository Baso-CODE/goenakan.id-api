import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  CreateQuotationNoteCategoryDTO,
  UpdateQuotationNoteCategoryDTO,
} from "./dto/quotationNoteCategory.dto";

@injectable()
export class QuotationNoteCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ===============================================
  // GET ALL (List)
  // ===============================================
  async getAllCategories() {
    return await this.prisma.quotationNoteCategory.findMany({
      orderBy: { createdAt: "asc" }, // Urutkan berdasarkan tanggal buat (atau 'name')
      include: {
        _count: {
          select: { notes: true }, // Menghitung berapa kali kategori ini dipakai di quotation
        },
      },
    });
  }

  // ===============================================
  // GET ONE BY ID
  // ===============================================
  async getCategoryById(id: string) {
    const category = await this.prisma.quotationNoteCategory.findUnique({
      where: { id },
    });

    if (!category) {
      throw new ApiError("Kategori catatan tidak ditemukan", 404);
    }

    return category;
  }

  // ===============================================
  // CREATE
  // ===============================================
  async createCategory(data: CreateQuotationNoteCategoryDTO) {
    // 1. Cek Duplikasi Nama (Case Insensitive)
    const existing = await this.prisma.quotationNoteCategory.findFirst({
      where: {
        name: { equals: data.name },
      },
    });

    if (existing) {
      throw new ApiError(`Kategori dengan nama '${data.name}' sudah ada`, 400);
    }

    // 2. Create Data
    return await this.prisma.quotationNoteCategory.create({
      data: {
        name: data.name,
        isPublic: data.isPublic ?? true,
        templates: (data.templates || []) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // ===============================================
  // UPDATE
  // ===============================================
  async updateCategory(id: string, data: UpdateQuotationNoteCategoryDTO) {
    // 1. Cek Eksistensi
    const existing = await this.prisma.quotationNoteCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Kategori catatan tidak ditemukan", 404);
    }

    // 2. Siapkan Payload Update
    const updateData: Prisma.QuotationNoteCategoryUpdateInput = {
      name: data.name,
      isPublic: data.isPublic,
    };

    if (data.templates) {
      updateData.templates = data.templates as unknown as Prisma.InputJsonValue;
    }

    // 3. Eksekusi Update
    return await this.prisma.quotationNoteCategory.update({
      where: { id },
      data: updateData,
    });
  }

  // ===============================================
  // DELETE
  // ===============================================
  async deleteCategory(id: string) {
    // 1. Cek Eksistensi & Usage
    const category = await this.prisma.quotationNoteCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { notes: true },
        },
      },
    });

    if (!category) {
      throw new ApiError("Kategori catatan tidak ditemukan", 404);
    }

    // 2. Safety Check: Jangan hapus jika sudah dipakai di Quotation
    if (category._count.notes > 0) {
      throw new ApiError(
        `Tidak dapat menghapus kategori '${category.name}' karena sedang digunakan dalam ${category._count.notes} Quotation.`,
        400,
      );
    }

    // 3. Delete
    return await this.prisma.quotationNoteCategory.delete({
      where: { id },
    });
  }
}
