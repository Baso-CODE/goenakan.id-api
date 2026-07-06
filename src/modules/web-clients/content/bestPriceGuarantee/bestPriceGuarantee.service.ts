import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  CreateBestPriceGuaranteeDTO,
  UpdateBestPriceGuaranteeDTO,
} from "./dto/bestPriceGuarantee.dto";

export interface BestPriceGuaranteeExportQuery {
  startDate?: string;
  endDate?: string;
  isActive?: "true" | "false";
  categoryId?: number;
}

@injectable()
export class BestPriceGuaranteeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  // =========================================================
  // === PUBLIC SERVICES (UNTUK FRONTEND CLIENT) ===
  // =========================================================

  async getMainPageGuarantees(query?: { categoryId?: number }) {
    try {
      const where: any = {
        isActive: true,
        category: {
          isActive: true,
        },
      };

      if (query?.categoryId) {
        where.categoryId = query.categoryId;
      }

      const data = await this.prisma.bestPriceGuarantee.findMany({
        where,
        include: {
          category: {
            select: { id: true, nameId: true, nameEn: true, slug: true },
          },
        },
        orderBy: [
          { category: { displayOrder: "asc" } },
          { displayOrder: "asc" },
        ],
      });
      return { data };
    } catch (error) {
      console.error(
        "❌ Error fetching Main Page Best Price Guarantees:",
        error,
      );
      throw new Error("Failed to fetch main page guarantees.");
    }
  }

  // =========================================================
  // === ADMIN SERVICES ===
  // =========================================================

  // === GET ALL WITH PAGINATION (Bilingual Support) ===
  async getAllGuarantees(query: {
    page?: number;
    take?: number;
    search?: string;
    categoryId?: number;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      if (query.search) {
        where.OR = [
          { titleId: { contains: query.search } },
          { titleEn: { contains: query.search } },
          { contentId: { contains: query.search } },
          { contentEn: { contains: query.search } },
        ];
      }

      if (query.categoryId) {
        where.categoryId = query.categoryId;
      }

      const count = await this.prisma.bestPriceGuarantee.count({ where });

      const data = await this.prisma.bestPriceGuarantee.findMany({
        where,
        skip,
        take,
        include: {
          category: {
            select: { id: true, nameId: true, nameEn: true },
          },
        },
        orderBy: { displayOrder: "asc" },
      });

      const meta = this.pagination.generateMeta({ count, page, take });
      return { data, meta };
    } catch (error) {
      console.error("❌ Error in Get All Best Price Guarantees:", error);
      throw new Error("Failed to fetch best price guarantees.");
    }
  }

  // === GET BY ID ===
  async getGuaranteeById(id: number) {
    const guarantee = await this.prisma.bestPriceGuarantee.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });

    if (!guarantee)
      throw new ApiError("Best Price Guarantee item not found", 404);

    return guarantee;
  }

  // === CREATE (Bilingual) ===
  async createGuarantee(data: CreateBestPriceGuaranteeDTO) {
    const categoryExists =
      await this.prisma.bestPriceGuaranteeCategory.findUnique({
        where: { id: data.categoryId },
      });

    if (!categoryExists) throw new ApiError("Category ID not found", 404);

    return await this.prisma.bestPriceGuarantee.create({
      data: {
        titleId: data.titleId,
        titleEn: data.titleEn,
        contentId: data.contentId,
        contentEn: data.contentEn,
        categoryId: data.categoryId,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  // === UPDATE ===
  async updateGuarantee(id: number, data: UpdateBestPriceGuaranteeDTO) {
    const existing = await this.prisma.bestPriceGuarantee.findUnique({
      where: { id },
    });

    if (!existing)
      throw new ApiError("Best Price Guarantee item not found", 404);

    if (data.categoryId) {
      const catExists = await this.prisma.bestPriceGuaranteeCategory.findUnique(
        {
          where: { id: data.categoryId },
        },
      );
      if (!catExists) throw new ApiError("New Category ID not found", 404);
    }

    const updated = await this.prisma.bestPriceGuarantee.update({
      where: { id },
      data,
    });

    return updated;
  }

  // === DELETE ===
  async deleteGuarantee(id: number) {
    const existing = await this.prisma.bestPriceGuarantee.findUnique({
      where: { id },
    });

    if (!existing)
      throw new ApiError("Best Price Guarantee item not found", 404);

    const deleted = await this.prisma.bestPriceGuarantee.delete({
      where: { id },
    });

    return deleted;
  }

  // === EXCEL EXPORT (Bilingual) ===
  async exportGuaranteeToExcel(
    query: BestPriceGuaranteeExportQuery,
  ): Promise<Buffer> {
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

    const guarantees = await this.prisma.bestPriceGuarantee.findMany({
      where,
      include: { category: { select: { nameId: true, nameEn: true } } },
      orderBy: { createdAt: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Best Price Guarantees");

    worksheet.columns = [
      { header: "Kategori (ID)", key: "catId", width: 20 },
      { header: "Category (EN)", key: "catEn", width: 20 },
      { header: "Judul (ID)", key: "titleId", width: 30 },
      { header: "Title (EN)", key: "titleEn", width: 30 },
      { header: "Konten (ID)", key: "contentId", width: 40 },
      { header: "Content (EN)", key: "contentEn", width: 40 },
      { header: "Status", key: "isActive", width: 15 },
    ];

    guarantees.forEach((g) => {
      worksheet.addRow({
        catId: g.category.nameId,
        catEn: g.category.nameEn,
        titleId: g.titleId,
        titleEn: g.titleEn,
        contentId: g.contentId.replace(/<[^>]*>?/gm, ""), // Strip HTML tags for clean excel
        contentEn: g.contentEn.replace(/<[^>]*>?/gm, ""),
        isActive: g.isActive ? "Active" : "Inactive",
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
