import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
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

  async createCategory(data: CreateQuotationNoteCategoryDTO) {
    const existing = await this.prisma.quotationNoteCategory.findFirst({
      where: { name: data.name },
    });

    if (existing) {
      throw new ApiError(`Kategori '${data.name}' sudah ada`, 400);
    }

    const templates = (data.templates ?? []).map((template) => ({
      id: template.id ?? randomUUID(),
      title: template.title,
      content: template.content,
    }));

    return this.prisma.quotationNoteCategory.create({
      data: {
        name: data.name,
        isPublic: data.isPublic ?? true,
        templates: templates as Prisma.InputJsonValue,
      },
    });
  }

  async updateCategory(id: string, data: UpdateQuotationNoteCategoryDTO) {
    const existing = await this.prisma.quotationNoteCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Kategori catatan tidak ditemukan", 404);
    }

    const updateData: Prisma.QuotationNoteCategoryUpdateInput = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
    };

    if (data.templates !== undefined) {
      const templates = data.templates.map((template) => ({
        id: template.id ?? randomUUID(),
        title: template.title,
        content: template.content,
      }));

      const ids = templates.map((template) => template.id);
      if (new Set(ids).size !== ids.length) {
        throw new ApiError("Terdapat ID template yang duplikat", 400);
      }

      updateData.templates = templates as Prisma.InputJsonValue;
    }

    return this.prisma.quotationNoteCategory.update({
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
