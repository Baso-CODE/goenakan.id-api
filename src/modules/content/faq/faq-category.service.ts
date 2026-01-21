import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";
import { PaginationService } from "../../pagination/pagination.service"; // Sesuaikan path
import { PrismaService } from "../../prisma/prisma.service"; // Sesuaikan path
// Sesuaikan path
import { ApiError } from "../../../utils/api-error";
import { SlugService } from "../../../utils/genereateSlug";
import {
  CreateFaqCategoryDTO,
  UpdateFaqCategoryDTO,
} from "./dto/faq-category.dto"; // Sesuaikan path

export interface FaqCategoryExportQuery {
  startDate?: string;
  endDate?: string;
  isActive?: "true" | "false";
}

@injectable()
export class FaqCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === GET ALL WITH PAGINATION ===
  async getAllFaqCategories(query: {
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

      const count = await this.prisma.faqCategory.count({ where });

      const data = await this.prisma.faqCategory.findMany({
        where,
        skip,
        take,
        orderBy: {
          displayOrder: "asc", // Urutkan berdasarkan displayOrder, bukan createdAt
        },
      });

      const meta = this.pagination.generateMeta({
        count,
        page,
        take,
      });

      return { data, meta };
    } catch (error) {
      console.error("❌ Error in Get All Faq Categories:", error);
      throw new Error("Failed to fetch faq categories.");
    }
  }

  // === CREATE ===
  async createFaqCategory(data: CreateFaqCategoryDTO) {
    // Gunakan slug dari input jika ada, jika tidak generate dari nama
    const slug = data.slug
      ? this.slug.create(data.slug)
      : this.slug.create(data.name);

    // Cek duplikasi slug
    const existing = await this.prisma.faqCategory.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ApiError("Category with this slug/name already exists", 400);
    }

    const category = await this.prisma.faqCategory.create({
      data: {
        name: data.name,
        slug: slug,
        description: data.description,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });

    return category;
  }

  // === GET BY ID ===
  async getFaqCategoryById(id: string) {
    const category = await this.prisma.faqCategory.findUnique({
      where: { id },
    });

    if (!category) throw new ApiError("FAQ Category not found", 404);

    return category;
  }

  // === UPDATE ===
  async updateFaqCategory(id: string, data: UpdateFaqCategoryDTO) {
    const existing = await this.prisma.faqCategory.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("FAQ Category not found", 404);

    // Logic update slug jika nama berubah atau slug diganti manual
    let newSlug = existing.slug;
    if (data.slug) {
      newSlug = this.slug.create(data.slug);
    } else if (data.name && data.name !== existing.name) {
      newSlug = this.slug.create(data.name);
    }

    const updated = await this.prisma.faqCategory.update({
      where: { id },
      data: {
        ...data,
        slug: newSlug,
      },
    });

    return updated;
  }

  // === DELETE ===
  async deleteFaqCategory(id: string) {
    const existing = await this.prisma.faqCategory.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("FAQ Category not found", 404);

    // Cek apakah ada FAQ yang menggunakan kategori ini
    const relatedFaqs = await this.prisma.faq.count({
      where: { categoryId: id },
    });

    if (relatedFaqs > 0) {
      throw new ApiError(
        `Cannot delete. There are ${relatedFaqs} FAQs in this category.`,
        400,
      );
    }

    const deleted = await this.prisma.faqCategory.delete({
      where: { id },
    });

    return deleted;
  }

  // === LIST ALL (NO PAGINATION) ===
  // Berguna untuk Dropdown saat Create FAQ Item
  async getAllFaqCategoriesList() {
    try {
      return await this.prisma.faqCategory.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { displayOrder: "asc" },
      });
    } catch (error) {
      console.error("❌ Error in Get Faq Category List:", error);
      throw new Error("Failed to fetch faq category list.");
    }
  }

  // === EXCEL EXPORT ===
  async exportFaqCategoryToExcel(
    query: FaqCategoryExportQuery,
  ): Promise<Buffer> {
    const { startDate, endDate, isActive } = query;

    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.createdAt.lt = end;
      }
    }

    if (isActive) {
      where.isActive = isActive === "true";
    }

    const categories = await this.prisma.faqCategory.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("FAQ Categories");

    worksheet.columns = [
      { header: "Nama Kategori", key: "name", width: 30 },
      { header: "Slug", key: "slug", width: 25 },
      { header: "Deskripsi", key: "description", width: 40 },
      { header: "Urutan", key: "displayOrder", width: 10 },
      { header: "Status", key: "isActive", width: 15 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    categories.forEach((cat) => {
      worksheet.addRow({
        name: cat.name,
        slug: cat.slug,
        description: cat.description || "-",
        displayOrder: cat.displayOrder,
        isActive: cat.isActive ? "Aktif" : "Tidak Aktif",
        createdAt: cat.createdAt.toLocaleString("id-ID"),
      });
    });

    // Styling Header
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
