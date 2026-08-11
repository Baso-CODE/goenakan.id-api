import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../../utils/api-error";
import { SlugService } from "../../../../../utils/genereateSlug";
import { PaginationService } from "../../../../pagination/pagination.service";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  CreateArticleTagDTO,
  UpdateArticleTagDTO,
} from "../dto/tag-article.dto";

export interface ArticleTagExportQuery {
  startDate?: string;
  endDate?: string;
}

@injectable()
export class ArticleTagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === GET ALL TAGS (WITH PAGINATION) ===
  async getAllTags(query: { page?: number; take?: number; search?: string }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      if (query.search) {
        where.name = {
          contains: query.search,
          mode: "insensitive", // Jika database mendukung case-insensitive
        };
      }

      const count = await this.prisma.articleTag.count({ where });

      const data = await this.prisma.articleTag.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      });

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
      console.error("❌ Error in Get All Article Tags:", error);
      throw new Error("Failed to fetch article tags.");
    }
  }

  // === CREATE TAG ===
  async createTag(data: CreateArticleTagDTO) {
    const slug = data.slug || this.slug.create(data.name);

    // Cek duplikasi
    const existing = await this.prisma.articleTag.findFirst({
      where: {
        OR: [{ name: data.name }, { slug: slug }],
      },
    });

    if (existing) {
      throw new ApiError("Tag name or slug already exists", 400);
    }

    const tag = await this.prisma.articleTag.create({
      data: {
        name: data.name,
        slug: slug,
      },
    });

    return tag;
  }

  // === GET TAG BY ID ===
  async getTagById(id: string) {
    const tag = await this.prisma.articleTag.findUnique({
      where: { id },
    });
    if (!tag) throw new ApiError("Article Tag not found", 404);
    return tag;
  }

  // === UPDATE TAG ===
  async updateTag(id: string, data: UpdateArticleTagDTO) {
    const existing = await this.prisma.articleTag.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Article Tag not found", 404);

    // Update slug jika nama berubah
    let slug = existing.slug;
    if (data.name && data.name !== existing.name) {
      slug = this.slug.create(data.name);

      const duplicate = await this.prisma.articleTag.findFirst({
        where: {
          OR: [{ name: data.name }, { slug: slug }],
          id: { not: id },
        },
      });
      if (duplicate) throw new ApiError("Tag name or slug already exists", 400);
    }

    const updated = await this.prisma.articleTag.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug || slug,
      },
    });

    return updated;
  }

  // === DELETE TAG ===
  async deleteTag(id: string) {
    const existing = await this.prisma.articleTag.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Article Tag not found", 404);

    // Karena menggunakan onDelete: Cascade di ArticleTagMap,
    // relasi di pivot table akan otomatis terhapus
    return await this.prisma.articleTag.delete({
      where: { id },
    });
  }

  // === GET TAG LIST FOR SELECT/DROPDOWN ===
  async getAllTagsList() {
    return await this.prisma.articleTag.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    });
  }

  // === EXPORT TO EXCEL ===
  async exportTagsToExcel(query: ArticleTagExportQuery): Promise<Buffer> {
    const { startDate, endDate } = query;
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

    const tags = await this.prisma.articleTag.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Article Tags");

    worksheet.columns = [
      { header: "ID", key: "id", width: 15 },
      { header: "Nama Tag", key: "name", width: 25 },
      { header: "Slug", key: "slug", width: 25 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    tags.forEach((tag) => {
      worksheet.addRow({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        createdAt: tag.createdAt.toLocaleString("id-ID"),
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
      cell.alignment = { horizontal: "center" };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
