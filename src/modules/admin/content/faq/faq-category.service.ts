import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
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
        //  Pembaruan: Mencari di kedua bahasa (Bilingual Search)
        where.OR = [
          { nameId: { contains: query.search } },
          { nameEn: { contains: query.search } },
        ];
      }

      const count = await this.prisma.faqCategory.count({ where });

      const data = await this.prisma.faqCategory.findMany({
        where,
        skip,
        take,
        orderBy: {
          displayOrder: "asc",
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
    const baseNameForSlug = data.slug || data.nameEn || data.nameId;
    const slug = this.slug.create(baseNameForSlug);

    // Cek duplikasi slug
    const existing = await this.prisma.faqCategory.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ApiError("Category with this slug already exists", 400);
    }

    const category = await this.prisma.faqCategory.create({
      data: {
        nameId: data.nameId,
        nameEn: data.nameEn,
        slug: slug,
        descriptionId: data.descriptionId,
        descriptionEn: data.descriptionEn,
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

    //  Pembaruan: Logic update slug jika nama berubah
    let newSlug = existing.slug;
    if (data.slug) {
      newSlug = this.slug.create(data.slug);
    } else if (data.nameEn && data.nameEn !== existing.nameEn) {
      newSlug = this.slug.create(data.nameEn);
    } else if (data.nameId && data.nameId !== existing.nameId) {
      newSlug = this.slug.create(data.nameId);
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
        //  Pembaruan: Mengambil nameId dan nameEn
        select: { id: true, nameId: true, nameEn: true },
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

    //  Pembaruan: Menambahkan kolom Bahasa Indonesia dan Inggris
    worksheet.columns = [
      { header: "Nama Kategori (ID)", key: "nameId", width: 30 },
      { header: "Category Name (EN)", key: "nameEn", width: 30 },
      { header: "Slug", key: "slug", width: 25 },
      { header: "Deskripsi (ID)", key: "descriptionId", width: 40 },
      { header: "Description (EN)", key: "descriptionEn", width: 40 },
      { header: "Urutan / Order", key: "displayOrder", width: 15 },
      { header: "Status", key: "isActive", width: 15 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    categories.forEach((cat) => {
      worksheet.addRow({
        nameId: cat.nameId,
        nameEn: cat.nameEn,
        slug: cat.slug,
        descriptionId: cat.descriptionId || "-",
        descriptionEn: cat.descriptionEn || "-",
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
