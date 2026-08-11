import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateNoteTemplateDTO } from "./dto/createNoteTemplate.dto";
import { UpdateNoteTemplateDTO } from "./dto/updateNoteTemplate.dto";

export interface NoteTemplateExportQuery {
  categoryId?: string;
  isActive?: "true" | "false";
  search?: string;
}

@injectable()
export class NoteTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  // === GET ALL WITH PAGINATION & FILTER ===
  async getAllNoteTemplates(query: {
    page?: number;
    take?: number;
    search?: string;
    categoryId?: string; // Filter khusus
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      // Filter by Search (Title or Content)
      if (query.search) {
        where.OR = [
          { title: { contains: query.search } },
          { content: { contains: query.search } },
        ];
      }

      // Filter by Category
      if (query.categoryId) {
        where.categoryId = query.categoryId;
      }

      const count = await this.prisma.noteTemplate.count({ where });

      const data = await this.prisma.noteTemplate.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          category: {
            select: { id: true, name: true }, // Include nama kategori
          },
        },
      });

      const meta = this.pagination.generateMeta({
        count,
        page,
        take,
      });

      return { data, meta };
    } catch (error) {
      console.error("❌ Error in Get All Note Templates:", error);
      throw new Error("Failed to fetch note templates.");
    }
  }

  // === CREATE TEMPLATE ===
  async createNoteTemplate(data: CreateNoteTemplateDTO) {
    // 1. Validasi Category Exist
    const categoryExists = await this.prisma.noteCategory.findUnique({
      where: { id: data.categoryId },
    });

    if (!categoryExists) {
      throw new ApiError("Category ID not found", 404);
    }

    // 2. Create
    const template = await this.prisma.noteTemplate.create({
      data: {
        categoryId: data.categoryId,
        title: data.title,
        content: data.content,
        isActive: true,
      },
    });

    return template;
  }

  // === GET BY ID ===
  async getNoteTemplateById(id: string) {
    const template = await this.prisma.noteTemplate.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });

    if (!template) throw new ApiError("Note Template not found", 404);

    return template;
  }

  // === GET LIST BY CATEGORY ID (Helper untuk Dropdown di Frontend) ===
  async getTemplatesByCategoryList(categoryId: string) {
    return await this.prisma.noteTemplate.findMany({
      where: {
        categoryId,
        isActive: true,
      },
      select: {
        id: true,
        title: true,
        content: true,
      },
      orderBy: { title: "asc" },
    });
  }

  // === UPDATE TEMPLATE ===
  async updateNoteTemplate(id: string, data: Partial<UpdateNoteTemplateDTO>) {
    const existing = await this.prisma.noteTemplate.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Note Template not found", 404);

    // Jika user mau ganti kategori, pastikan kategori baru valid
    if (data.categoryId && data.categoryId !== existing.categoryId) {
      const catExists = await this.prisma.noteCategory.findUnique({
        where: { id: data.categoryId },
      });
      if (!catExists) throw new ApiError("New Category ID not found", 404);
    }

    const updated = await this.prisma.noteTemplate.update({
      where: { id },
      data: { ...data },
    });

    return updated;
  }

  // === DELETE TEMPLATE ===
  async deleteNoteTemplate(id: string) {
    const existing = await this.prisma.noteTemplate.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Note Template not found", 404);

    const deleted = await this.prisma.noteTemplate.delete({
      where: { id },
    });

    return deleted;
  }

  // === EXPORT TO EXCEL ===
  async exportNoteTemplateToExcel(
    query: NoteTemplateExportQuery,
  ): Promise<Buffer> {
    const { categoryId, isActive, search } = query;

    const where: any = {};

    if (categoryId) where.categoryId = categoryId;
    if (isActive) where.isActive = isActive === "true";
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
      ];
    }

    const templates = await this.prisma.noteTemplate.findMany({
      where,
      include: {
        category: { select: { name: true } }, // Ambil nama kategori
      },
      orderBy: { createdAt: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Template Catatan");

    worksheet.columns = [
      { header: "Kategori", key: "category", width: 25 },
      { header: "Judul Template", key: "title", width: 30 },
      { header: "Isi Catatan", key: "content", width: 50 },
      { header: "Status Aktif", key: "isActive", width: 15 },
      { header: "Dibuat Pada", key: "createdAt", width: 20 },
    ];

    templates.forEach((t) => {
      worksheet.addRow({
        category: t.category.name,
        title: t.title,
        content: t.content,
        isActive: t.isActive ? "Ya" : "Tidak",
        createdAt: t.createdAt.toLocaleString("id-ID"),
      });
    });

    // Style Header
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "003366" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
