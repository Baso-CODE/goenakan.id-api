import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { ApiError } from "../../../utils/api-error";
import { CreateContactPlatformDTO } from "./dto/createContactPlatform.dto";
import { UpdateContactPlatformDTO } from "./dto/updateContactPlatform.dto";
import { PaginationService } from "../../pagination/pagination.service";
import { SlugService } from "../../../utils/genereateSlug";
import * as ExcelJS from "exceljs";

export interface PlatformExportQuery {
  startDate?: string;
  endDate?: string;
  isActive?: "true" | "false" | "ALL";
}

@injectable()
export class ContactPlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === GET ALL (WITH PAGINATION) ===
  async getAllPlatforms(query: {
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
        where.OR = [
          { name: { contains: query.search } },
          { slug: { contains: query.search } },
        ];
      }

      const count = await this.prisma.contactPlatform.count({ where });

      const data = await this.prisma.contactPlatform.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      });

      const meta = this.pagination.generateMeta({ count, page, take });

      return { data, meta };
    } catch (error) {
      console.error("❌ Error in getAllPlatforms:", error);
      throw new Error("Failed to fetch contact platforms.");
    }
  }

  // === GET ACTIVE PLATFORMS (NO PAGINATION) ===
  async getActivePlatforms() {
    try {
      const data = await this.prisma.contactPlatform.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          icon: true,
        },
      });
      return data;
    } catch (error) {
      console.error("❌ Error in getActivePlatforms:", error);
      throw new Error("Failed to fetch active platforms.");
    }
  }

  // === CREATE PLATFORM ===
  async createPlatform(data: CreateContactPlatformDTO) {
    const existing = await this.prisma.contactPlatform.findFirst({
      where: {
        OR: [{ name: data.name }],
      },
    });

    const slug = this.slug.create(data.name);
    if (existing) {
      throw new ApiError("Platform name or slug already exists", 400);
    }

    const platform = await this.prisma.contactPlatform.create({
      data: {
        name: data.name,
        slug: slug,
        icon: data.icon ?? null,
        isActive: data.isActive ?? true,
      },
    });

    return platform;
  }

  // === GET PLATFORM BY ID ===
  async getPlatformById(id: string) {
    const platform = await this.prisma.contactPlatform.findUnique({
      where: { id },
    });

    if (!platform) throw new ApiError("Platform not found", 404);

    return platform;
  }

  // === UPDATE PLATFORM ===
  async updatePlatform(id: string, data: UpdateContactPlatformDTO) {
    const existing = await this.prisma.contactPlatform.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Platform not found", 404);

    let updatedSlug = existing.slug;

    if (data.name && data.name !== existing.name) {
      updatedSlug = this.slug.create(data.name);

      const duplicate = await this.prisma.contactPlatform.findFirst({
        where: {
          OR: [{ name: data.name }, { slug: updatedSlug }],
          NOT: { id },
        },
      });

      if (duplicate) {
        throw new ApiError("Platform name or slug already exists", 400);
      }
    }

    // === Update data ===
    const updated = await this.prisma.contactPlatform.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        slug: updatedSlug,
        icon: data.icon ?? existing.icon,
        isActive: data.isActive ?? existing.isActive,
      },
    });

    return updated;
  }

  // === SOFT DELETE PLATFORM ===
  async deletePlatform(id: string) {
    const existing = await this.prisma.contactPlatform.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Platform not found", 404);

    const deleted = await this.prisma.contactPlatform.update({
      where: { id },
      data: { isActive: false },
    });

    return deleted;
  }

  async exportContactPlatformsToExcel(
    query: PlatformExportQuery,
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
        end.setDate(end.getDate() + 1); // Memastikan tanggal akhir termasuk hari itu
        where.createdAt.lt = end;
      }
    }

    // Filter by isActive status
    if (isActive && isActive !== "ALL") {
      where.isActive = isActive === "true";
    }

    // 2. MENGAMBIL DATA DARI DATABASE DENGAN RELASI
    const platforms = await this.prisma.contactPlatform.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        isActive: true,
        createdAt: true,
        // Menghitung jumlah vendor contact yang menggunakan platform ini
        _count: {
          select: { contacts: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Contact Platforms");

    // Menentukan Kolom (Headers)
    worksheet.columns = [
      { header: "ID (Partial)", key: "id", width: 12 },
      { header: "Nama Platform", key: "name", width: 30 },
      { header: "Slug", key: "slug", width: 30 },
      { header: "URL Icon", key: "icon", width: 40 },
      { header: "Status Aktif", key: "isActive", width: 15 },
      { header: "Jumlah Dipakai (Vendor)", key: "contactCount", width: 25 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    // Menambahkan Data Baris
    platforms.forEach((platform) => {
      worksheet.addRow({
        id: platform.id,
        name: platform.name,
        slug: platform.slug,
        icon: platform.icon || "N/A",
        isActive: platform.isActive ? "Ya" : "Tidak",
        contactCount: platform._count.contacts,
        createdAt: platform.createdAt.toLocaleString("id-ID", {
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
        fgColor: { argb: "00A86B" }, // Warna hijau untuk Platform
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // 4. MENGHASILKAN BUFFER DAN MENGEMBALIKAN
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
