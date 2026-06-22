import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateFaqDTO, UpdateFaqDTO } from "./dto/faq.dto";

export interface FaqExportQuery {
  startDate?: string;
  endDate?: string;
  isActive?: "true" | "false";
  categoryId?: string;
}

@injectable()
export class FaqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  // =========================================================
  // === PUBLIC SERVICES (UNTUK FRONTEND CLIENT) ===
  // =========================================================

  // 1. Ambil FAQ Khusus Landing Page (Hanya Featured)
  async getLandingPageFaqs(take: number = 5) {
    try {
      const data = await this.prisma.faq.findMany({
        where: {
          isFeatured: true,
          isActive: true,
          category: {
            isActive: true,
          },
        },
        take: take,
        include: {
          category: {
            select: { id: true, nameId: true, nameEn: true, slug: true },
          },
        },
        orderBy: {
          displayOrder: "asc",
        },
      });

      return data;
    } catch (error) {
      console.error("❌ Error fetching Landing Page FAQs:", error);
      throw new Error("Failed to fetch landing page FAQs.");
    }
  }

  async getMainPageFaqs(query: {
    page?: number;
    take?: number;
    categoryId?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {
        isFeatured: false,
        isActive: true,
        category: {
          isActive: true,
        },
      };

      if (query.categoryId) {
        where.categoryId = query.categoryId;
      }

      const count = await this.prisma.faq.count({ where });

      const data = await this.prisma.faq.findMany({
        where,
        skip,
        take,
        include: {
          category: {
            select: { id: true, nameId: true, nameEn: true, slug: true },
          },
        },
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
      console.error("❌ Error fetching Main Page FAQs:", error);
      throw new Error("Failed to fetch main page FAQs.");
    }
  }

  // === GET ALL WITH PAGINATION (Bilingual Support) ===
  async getAllFaqs(query: {
    page?: number;
    take?: number;
    search?: string;
    categoryId?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      if (query.search) {
        // ✨ Search in both Indonesian and English fields
        where.OR = [
          { questionId: { contains: query.search } },
          { questionEn: { contains: query.search } },
          { answerId: { contains: query.search } },
          { answerEn: { contains: query.search } },
        ];
      }

      if (query.categoryId) {
        where.categoryId = query.categoryId;
      }

      const count = await this.prisma.faq.count({ where });

      const data = await this.prisma.faq.findMany({
        where,
        skip,
        take,
        include: {
          category: {
            select: { id: true, nameId: true, nameEn: true },
          },
        },
        orderBy: [{ isFeatured: "desc" }, { displayOrder: "asc" }],
      });

      const meta = this.pagination.generateMeta({ count, page, take });
      return { data, meta };
    } catch (error) {
      console.error("❌ Error in Get All FAQs:", error);
      throw new Error("Failed to fetch FAQs.");
    }
  }

  // === CREATE ===
  // === CREATE (Bilingual) ===
  async createFaq(data: CreateFaqDTO) {
    const categoryExists = await this.prisma.faqCategory.findUnique({
      where: { id: data.categoryId },
    });

    if (!categoryExists) throw new ApiError("Category ID not found", 404);

    return await this.prisma.faq.create({
      data: {
        questionId: data.questionId,
        questionEn: data.questionEn,
        answerId: data.answerId,
        answerEn: data.answerEn,
        categoryId: data.categoryId,
        displayOrder: data.displayOrder ?? 0,
        isFeatured: data.isFeatured ?? false,
        isActive: data.isActive ?? true,
      },
    });
  }
  // === GET BY ID ===
  async getFaqById(id: string) {
    const faq = await this.prisma.faq.findUnique({
      where: { id },
      include: {
        category: true, // Include category details
      },
    });

    if (!faq) throw new ApiError("FAQ item not found", 404);

    return faq;
  }

  // === UPDATE ===
  async updateFaq(id: string, data: UpdateFaqDTO) {
    const existing = await this.prisma.faq.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("FAQ item not found", 404);

    if (data.categoryId) {
      const catExists = await this.prisma.faqCategory.findUnique({
        where: { id: data.categoryId },
      });
      if (!catExists) throw new ApiError("New Category ID not found", 404);
    }

    const updated = await this.prisma.faq.update({
      where: { id },
      data,
    });

    return updated;
  }

  // === DELETE ===
  async deleteFaq(id: string) {
    const existing = await this.prisma.faq.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("FAQ item not found", 404);

    const deleted = await this.prisma.faq.delete({
      where: { id },
    });

    return deleted;
  }

  // === EXCEL EXPORT (Bilingual) ===
  async exportFaqToExcel(query: FaqExportQuery): Promise<Buffer> {
    const { startDate, endDate, isActive, categoryId } = query;
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

    if (isActive) where.isActive = isActive === "true";
    if (categoryId) where.categoryId = categoryId;

    const faqs = await this.prisma.faq.findMany({
      where,
      include: { category: { select: { nameId: true, nameEn: true } } },
      orderBy: { createdAt: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("FAQ Data");

    worksheet.columns = [
      { header: "Kategori (ID)", key: "catId", width: 20 },
      { header: "Category (EN)", key: "catEn", width: 20 },
      { header: "Pertanyaan (ID)", key: "qId", width: 30 },
      { header: "Question (EN)", key: "qEn", width: 30 },
      { header: "Jawaban (ID)", key: "aId", width: 40 },
      { header: "Answer (EN)", key: "aEn", width: 40 },
    ];

    faqs.forEach((f) => {
      worksheet.addRow({
        catId: f.category.nameId,
        catEn: f.category.nameEn,
        qId: f.questionId,
        qEn: f.questionEn,
        aId: f.answerId.replace(/<[^>]*>?/gm, ""),
        aEn: f.answerEn.replace(/<[^>]*>?/gm, ""),
      });
    });

    // Styling Header...
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "003366" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
