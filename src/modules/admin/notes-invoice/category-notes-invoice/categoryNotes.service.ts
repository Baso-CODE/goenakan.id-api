import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateNoteCategoryDTO } from "../dto/createCategory.dto";
import { UpdateNoteCategoryDTO } from "../dto/updateCategory.dto";

export interface NoteCategoryExportQuery {
  startDate?: string;
  endDate?: string;
  isActive?: "true" | "false";
}

@injectable()
export class NoteCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === GET ALL WITH PAGINATION ===
  async getAllNoteCategories(query: {
    page?: number;
    take?: number;
    search?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      if (query.search) {
        where.name = {
          contains: query.search,
        };
      }

      const count = await this.prisma.noteCategory.count({ where });

      const data = await this.prisma.noteCategory.findMany({
        where,
        skip,
        take,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          _count: {
            select: { templates: true }, // Opsional: Hitung jumlah template di kategori ini
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
      console.error("❌ Error in Get All Note Categories:", error);
      throw new Error("Failed to fetch note categories.");
    }
  }

  // === CREATE CATEGORY ===
  async createNoteCategory(data: CreateNoteCategoryDTO) {
    const slug = this.slug.create(data.name);

    // Cek duplikasi nama
    const existing = await this.prisma.noteCategory.findFirst({
      where: { name: data.name },
    });

    if (existing) {
      throw new ApiError("Category name already exists", 400);
    }

    const category = await this.prisma.noteCategory.create({
      data: {
        name: data.name,
        slug: slug,
      },
    });

    return category;
  }

  // === GET BY SLUG ===
  async getNoteCategoryBySlug(slug: string) {
    const category = await this.prisma.noteCategory.findUnique({
      where: { slug },
      include: {
        templates: true, // Sertakan template di dalamnya jika perlu
      },
    });

    if (!category) throw new ApiError("Note Category not found", 404);

    return category;
  }

  // === UPDATE CATEGORY ===
  async updateNoteCategory(slug: string, data: Partial<UpdateNoteCategoryDTO>) {
    const existing = await this.prisma.noteCategory.findUnique({
      where: { slug },
    });

    if (!existing) throw new ApiError("Note Category not found", 404);

    // Jika nama berubah, update slug juga
    const newSlug =
      data.name && data.name !== existing.name
        ? this.slug.create(data.name)
        : existing.slug;

    const updated = await this.prisma.noteCategory.update({
      where: { slug },
      data: {
        ...data,
        slug: newSlug,
      },
    });

    return updated;
  }

  // === DELETE (HARD DELETE) ===
  async deleteNoteCategory(id: string) {
    const existing = await this.prisma.noteCategory.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Note Category not found", 404);

    // Hapus kategori (Pastikan di Schema relasi ke InvoiceNote/Template di-handle, misal onDelete: Cascade atau Restrict)
    const deleted = await this.prisma.noteCategory.delete({
      where: { id },
    });

    return deleted;
  }

  // === LIST ALL (NO PAGINATION - FOR DROPDOWN) ===

  async getAllNoteCategoriesList() {
    try {
      return await this.prisma.noteCategory.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,

          templates: {
            where: { isActive: true },
            select: {
              id: true,
              title: true,
              content: true,
            },
            orderBy: { title: "asc" },
          },
        },
        orderBy: { name: "asc" },
      });
    } catch (error) {
      console.error("❌ Error in Get Note Category List:", error);
      throw new Error("Failed to fetch note category list.");
    }
  }

  // === EXPORT TO EXCEL ===
  async exportNoteCategoryToExcel(
    query: NoteCategoryExportQuery,
  ): Promise<Buffer> {
    const { startDate, endDate, isActive } = query;

    // 1. MEMBANGUN KLAUSA WHERE PRISMA
    const where: any = {};

    // Filter by Date Range (createdAt)
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.createdAt.lt = end;
      }
    }

    // Filter by isActive status
    if (isActive) {
      where.isActive = isActive === "true";
    }

    // 2. MENGAMBIL DATA DARI DATABASE
    const categories = await this.prisma.noteCategory.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
        _count: { select: { templates: true } }, // Jumlah template
      },
      orderBy: { createdAt: "asc" },
    });

    // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Kategori Catatan");

    // Menentukan Kolom (Headers)
    worksheet.columns = [
      { header: "ID", key: "id", width: 32 }, // UUID panjang
      { header: "Nama Kategori", key: "name", width: 30 },
      { header: "Slug", key: "slug", width: 25 },
      { header: "Jumlah Template", key: "templates", width: 15 },
      { header: "Status Aktif", key: "isActive", width: 15 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    // Menambahkan Data Baris
    categories.forEach((cat) => {
      worksheet.addRow({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        templates: cat._count.templates,
        isActive: cat.isActive ? "Ya" : "Tidak",
        createdAt: cat.createdAt.toLocaleString("id-ID", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    });

    // Styling Header
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "003366" }, // Warna Biru Gelap
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
