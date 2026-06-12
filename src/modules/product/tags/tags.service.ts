import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { SlugService } from "../../../utils/genereateSlug";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTagDTO, UpdateTagDTO } from "./dto/tags.dto";

export interface TagExportQuery {
  startDate?: string;
  endDate?: string;
}

@injectable()
export class ProductTagService {
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

      // === Search by name ===
      if (query.search) {
        where.name = {
          contains: query.search,
          // Opsional: tambahkan mode: "insensitive" jika database Anda PostgreSQL
          // mode: "insensitive"
        };
      }

      // === Total data untuk pagination ===
      const count = await this.prisma.tag.count({ where });

      // === Ambil data tag ===
      const data = await this.prisma.tag.findMany({
        where,
        skip,
        take,
        orderBy: {
          createdAt: "desc", // Urutkan dari yang terbaru
        },
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
      console.error("❌ Error in Get All Tags:", error);
      throw new Error("Failed to fetch tags. See server log for details.");
    }
  }

  // === CREATE TAG ===
  async createTag(data: CreateTagDTO) {
    // Generate slug dari nama jika tidak dikirim dari DTO
    const tagSlug = data.slug ? data.slug : this.slug.create(data.name);

    // Cek apakah tag dengan nama atau slug yang sama sudah ada
    const existing = await this.prisma.tag.findFirst({
      where: {
        OR: [{ name: data.name }, { slug: tagSlug }],
      },
    });

    if (existing) {
      throw new ApiError("Tag name or slug already exists", 400);
    }

    const tag = await this.prisma.tag.create({
      data: {
        name: data.name,
        slug: tagSlug,
      },
    });

    return tag;
  }

  // === CREATE BULK TAGS ===
  async createBulkTags(names: string[]) {
    const uniqueNames = Array.from(
      new Set(names.map((n) => n.trim()).filter((n) => n.length > 0)),
    );

    if (uniqueNames.length === 0) return [];

    const existingTags = await this.prisma.tag.findMany({
      where: {
        name: { in: uniqueNames },
      },
    });

    const existingNames = existingTags.map((t) => t.name.toLowerCase());

    const newTagsToCreate = uniqueNames.filter(
      (name) => !existingNames.includes(name.toLowerCase()),
    );

    if (newTagsToCreate.length > 0) {
      const newTagsData = newTagsToCreate.map((name) => ({
        name: name,
        slug: this.slug.create(name),
      }));

      await this.prisma.tag.createMany({
        data: newTagsData,
        skipDuplicates: true,
      });
    }

    const allRequestedTags = await this.prisma.tag.findMany({
      where: {
        name: { in: uniqueNames },
      },
    });

    return allRequestedTags;
  }

  // === GET TAG BY ID ===
  async getTagById(id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
    });
    if (!tag) throw new ApiError("Tag not found", 404);
    return tag;
  }

  // === UPDATE TAG ===
  async updateTag(id: string, data: Partial<UpdateTagDTO>) {
    const existing = await this.prisma.tag.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Tag not found", 404);

    // Update slug jika ada perubahan nama, kecuali DTO mengirim slug secara eksplisit
    let newSlug = existing.slug;
    if (data.slug) {
      newSlug = data.slug;
    } else if (data.name && data.name !== existing.name) {
      newSlug = this.slug.create(data.name);
    }

    // Pastikan tidak ada duplikasi jika name/slug diganti
    if (data.name && data.name !== existing.name) {
      const duplicate = await this.prisma.tag.findFirst({
        where: {
          id: { not: id },
          OR: [{ name: data.name }, { slug: newSlug }],
        },
      });
      if (duplicate)
        throw new ApiError(
          "Tag name or slug already taken by another tag",
          400,
        );
    }

    const updated = await this.prisma.tag.update({
      where: { id },
      data: {
        ...data,
        slug: newSlug,
      },
    });

    return updated;
  }

  // === HARD DELETE TAG ===
  async deleteTag(id: string) {
    const existing = await this.prisma.tag.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Tag not found", 404);

    // Prisma akan otomatis menghapus relasi (pivot table) ke Product jika ada
    const deleted = await this.prisma.tag.delete({
      where: { id },
    });

    return deleted;
  }

  // === GET ALL TAGS LIST (NO PAGINATION, FOR DROPDOWN/SELECT) ===
  async getAllTagsList() {
    try {
      const tags = await this.prisma.tag.findMany({
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      });
      return tags;
    } catch (error) {
      console.error("❌ Error in Get All Tags List:", error);
      throw new Error("Failed to fetch tags list. See server log for details.");
    }
  }

  // === EXPORT TO EXCEL ===
  async exportTagsToExcel(query: TagExportQuery): Promise<Buffer> {
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
    const tags = await this.prisma.tag.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Tags Product");

    // Menentukan Kolom (Headers)
    worksheet.columns = [
      { header: "ID", key: "id", width: 40 },
      { header: "Nama Tag", key: "name", width: 30 },
      { header: "Slug", key: "slug", width: 25 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    // Menambahkan Data Baris
    tags.forEach((tag) => {
      worksheet.addRow({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        createdAt: tag.createdAt.toLocaleString("id-ID", {
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
