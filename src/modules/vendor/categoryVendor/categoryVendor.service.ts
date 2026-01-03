import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { ApiError } from "../../../utils/api-error";
import { CreateVendorCategoryDTO } from "./dto/createCategoryVendor.dto";
import { UpdateVendorCategoryDTO } from "./dto/updateCategoryVendor.dto";
import { PaginationService } from "../../pagination/pagination.service";
import { SlugService } from "../../../utils/genereateSlug";
import { VendorType } from "@prisma/client";
import * as ExcelJS from "exceljs";

export interface CategoryExportQuery {
  startDate?: string;
  endDate?: string;
  type?: VendorType | "ALL";
  isActive?: "true" | "false";
}
@injectable()
export class VendorCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === GET ALL ACTIVE CATEGORIES (WITH PAGINATION) ===
  async getAllCategories(query: {
    page?: number;
    take?: number;
    type?: string;
    search?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      // === Optional filter by type ===
      if (query.type && query.type !== "ALL") {
        where.type = query.type;
      }

      // === Optional search ===
      if (query.search) {
        where.name = {
          contains: query.search,
        };
      }

      // === Total data ===
      const count = await this.prisma.vendorCategory.count({ where });

      // === Data hasil query ===
      const data = await this.prisma.vendorCategory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      });

      // === Gunakan PaginationService (kalau kamu mau bentuk responsenya rapi) ===
      const meta = this.pagination.generateMeta({
        count,
        page,
        take,
      });

      return {
        data: data,
        meta,
      };
    } catch (error) {
      console.error("❌ Error in Get All Category Vendor:", error);
      throw new Error("Failed to fetch clients. See server log for details.");
    }
  }

  // === CREATE CATEGORY ===
  async createCategory(data: CreateVendorCategoryDTO) {
    const slug = this.slug.create(data.name);
    const existing = await this.prisma.vendorCategory.findFirst({
      where: { name: data.name },
    });

    if (existing) {
      throw new ApiError("Category name already exists", 400);
    }

    const category = await this.prisma.vendorCategory.create({
      data: {
        name: data.name,
        slug: slug,
        type: data.type,
        description: data.description ?? "",
        isActive: data.isActive ?? true,
      },
    });

    return category;
  }

  // === GET ALL ACTIVE CATEGORIES (NO PAGINATION) ===
  async getActiveCategories() {
    try {
      const data = await this.prisma.vendorCategory.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          type: true,
        },
      });

      return data;
    } catch (error) {
      console.error("❌ Error in Get Active Categories:", error);
      throw new Error("Failed to fetch active vendor categories.");
    }
  }

  // === GET CATEGORY BY ID ===
  async getCategoryById(id: string) {
    const category = await this.prisma.vendorCategory.findUnique({
      where: { id },
    });
    if (!category) throw new ApiError("Category not found", 404);
    return category;
  }

  // === UPDATE CATEGORY ===
  async updateCategory(id: string, data: Partial<UpdateVendorCategoryDTO>) {
    const existing = await this.prisma.vendorCategory.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Category not found", 404);

    const slug =
      data.name && data.name !== existing.name
        ? this.slug.create(data.name)
        : existing.slug;

    const updated = await this.prisma.vendorCategory.update({
      where: { id },
      data: {
        ...data,
        slug,
      },
    });

    return updated;
  }

  // === SOFT DELETE CATEGORY ===
  async deleteCategory(id: string) {
    const existing = await this.prisma.vendorCategory.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Category not found", 404);

    const deleted = await this.prisma.vendorCategory.update({
      where: { id },
      data: { isActive: false },
    });

    return deleted;
  }

  async exportVendorCategoriesToExcel(
    query: CategoryExportQuery,
  ): Promise<Buffer> {
    const { startDate, endDate, type, isActive } = query;

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

    // Filter by Type
    if (type && type !== "ALL") {
      where.type = type; // Langsung menggunakan nilai VendorType
    }

    // Filter by isActive status
    if (isActive) {
      where.isActive = isActive === "true";
    }

    // 2. MENGAMBIL DATA DARI DATABASE
    // Menggunakan model VendorCategory
    const categories = await this.prisma.vendorCategory.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        description: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Kategori Vendor");

    // Menentukan Kolom (Headers) sesuai skema VendorCategory
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Nama Kategori", key: "name", width: 30 },
      { header: "Slug", key: "slug", width: 25 },
      { header: "Tipe", key: "type", width: 15 },
      { header: "Deskripsi", key: "description", width: 40 },
      { header: "Status Aktif", key: "isActive", width: 15 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    // Menambahkan Data Baris
    categories.forEach((category) => {
      worksheet.addRow({
        id: category.id,
        name: category.name,
        slug: category.slug,
        type: category.type,
        description: category.description,
        isActive: category.isActive ? "Ya" : "Tidak",
        createdAt: category.createdAt.toLocaleString("id-ID", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    });

    // Styling Header (Opsional)
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
