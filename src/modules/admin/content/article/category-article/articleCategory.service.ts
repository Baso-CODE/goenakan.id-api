import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../../utils/api-error";
import { SlugService } from "../../../../../utils/genereateSlug";
import { PaginationService } from "../../../../pagination/pagination.service";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  CreateArticleCategoryDTO,
  UpdateArticleCategoryDTO,
} from "../dto/articleCategory.dto";

export interface ArticleCategoryExportQuery {
  startDate?: string;
  endDate?: string;
}

@injectable()
export class ArticleCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === GET ALL ACTIVE CATEGORIES (WITH PAGINATION) ===
  async getAllCategories(query: {
    page?: number;
    take?: number;
    search?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      // === Search by name ===
      if (query.search) {
        where.name = {
          contains: query.search,
        };
      }

      // === Total data untuk pagination ===
      const count = await this.prisma.articleCategory.count({ where });

      // === Ambil data kategori ===
      const data = await this.prisma.articleCategory.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      });

      // === Metadata pagination ===
      const meta = this.pagination.generateMeta({
        count,
        page,
        take,
      });

      return {
        data,
        meta,
      };
    } catch (error) {
      console.error("❌ Error in Get All Article Categories:", error);
      throw new Error(
        "Failed to fetch article categories. See server log for details.",
      );
    }
  }

  // === CREATE CATEGORY ===
  async createCategory(data: CreateArticleCategoryDTO) {
    // 1. Membuat slug menggunakan nama kategori versi bahasa Indonesia
    const slug = this.slug.create(data.name_id);

    // 2. Pengecekan nama_id atau slug duplikat
    const existing = await this.prisma.articleCategory.findFirst({
      where: {
        OR: [{ name_id: data.name_id }, { slug: slug }],
      },
    });

    // 3. Jika sudah ada, lemparkan error
    if (existing) {
      throw new ApiError("Category name (ID) or slug already exists", 400);
    }

    // 4. Menyimpan kategori baru ke database dengan struktur bilingual
    const category = await this.prisma.articleCategory.create({
      data: {
        name_id: data.name_id,
        description_id: data.description_id,
        name_en: data.name_en,
        description_en: data.description_en,
        slug: slug,
        isActive: data.isActive ?? true,
      },
    });

    return category;
  }

  // === GET CATEGORY BY ID ===
  async getCategoryById(id: string) {
    const category = await this.prisma.articleCategory.findUnique({
      where: { id },
    });

    // Jika ID tidak ditemukan di database
    if (!category) {
      throw new ApiError("Article Category not found", 404);
    }

    return category;
  }

  // === UPDATE CATEGORY ===
  async updateCategory(id: string, data: Partial<UpdateArticleCategoryDTO>) {
    const existing = await this.prisma.articleCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Article Category not found", 404);
    }

    const slug =
      data.name_id && data.name_id !== existing.name_id
        ? this.slug.create(data.name_id)
        : existing.slug;

    if (data.name_id && data.name_id !== existing.name_id) {
      const duplicate = await this.prisma.articleCategory.findFirst({
        where: { name_id: data.name_id, id: { not: id } },
      });

      if (duplicate) {
        throw new ApiError("Category name (ID) already exists", 400);
      }
    }

    // 4. Simpan perubahan ke database
    const updated = await this.prisma.articleCategory.update({
      where: { id },
      data: {
        ...data,
        slug,
      },
    });

    return updated;
  }

  // === DELETE CATEGORY ===
  async deleteCategory(id: string) {
    const existing = await this.prisma.articleCategory.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Article Category not found", 404);

    const deleted = await this.prisma.articleCategory.delete({
      where: { id },
    });

    return deleted;
  }

  // === GET CATEGORY LIST FOR DROPDOWN (NO PAGINATION) ===
  async getAllCategoriesList() {
    try {
      const categories = await this.prisma.articleCategory.findMany({
        where: { isActive: true },
        orderBy: {
          name_id: "asc",
        },
        select: {
          id: true,
          name_id: true,
          name_en: true,
        },
      });

      return categories;
    } catch (error) {
      console.error("❌ Error in Get All Article Categories List:", error);
      throw new Error(
        "Failed to fetch article categories list. See server log for details.",
      );
    }
  }

  // === EXPORT TO EXCEL ===
  async exportCategoryProductsToExcel(
    query: ArticleCategoryExportQuery,
  ): Promise<Buffer> {
    const { startDate, endDate } = query;

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

    // 2. MENGAMBIL DATA DARI DATABASE
    const categories = await this.prisma.articleCategory.findMany({
      where,
      select: {
        id: true,
        name_id: true,
        name_en: true,
        slug: true,
        description_id: true,
        description_en: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Article Categories");

    // Menentukan Kolom (Headers) sesuai skema ArticleCategory
    worksheet.columns = [
      { header: "ID", key: "id", width: 15 },
      { header: "Nama Kategori Artikel", key: "name", width: 30 },
      { header: "Slug", key: "slug", width: 25 },
      { header: "Deskripsi", key: "description", width: 40 },
      { header: "Status", key: "status", width: 15 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    // Menambahkan Data Baris
    categories.forEach((category) => {
      worksheet.addRow({
        id: category.id,
        name_id: category.name_id,
        name_en: category.name_en,
        slug: category.slug,
        description_id: category.description_id || "-",
        description_en: category.description_en || "-",
        status: category.isActive ? "Aktif" : "Tidak Aktif",
        createdAt: category.createdAt.toLocaleString("id-ID", {
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
        fgColor: { argb: "003366" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
