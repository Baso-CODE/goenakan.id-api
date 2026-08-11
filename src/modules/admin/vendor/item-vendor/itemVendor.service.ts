import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateVendorItemDTO } from "./dto/createItemVendor.dto";
import { UpdateVendorItemDTO } from "./dto/updateItemVendor.dto";

export interface ItemVendorExportQuery {
  startDate?: string;
  endDate?: string;
  isActive?: "true" | "false" | "ALL";
  categoryId?: string;
}
@injectable()
export class VendorItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === CREATE ITEM ===
  async createItem(data: CreateVendorItemDTO) {
    // === CEK KATEGORI VALID ===
    const category = await this.prisma.vendorCategory.findUnique({
      where: { id: data.categoryId },
    });

    if (!category) {
      throw new ApiError("Category not found", 404);
    }

    // === GABUNGKAN CATEGORY + ITEM NAME ===
    const finalName = `${category.name} - ${data.name}`;
    const slug = this.slug.create(finalName);

    // === CEK DUPLIKAT NAMA DI DALAM KATEGORI ===
    const existing = await this.prisma.vendorItem.findFirst({
      where: {
        name: finalName,
        categoryId: data.categoryId,
      },
    });

    if (existing) {
      throw new ApiError("Item name already exists in this category", 400);
    }

    // === CREATE ITEM ===
    const item = await this.prisma.vendorItem.create({
      data: {
        name: finalName,
        slug: slug,
        description: data.description ?? "",
        isActive: data.isActive ?? true,
        categoryId: data.categoryId,
      },
    });

    return item;
  }

  // === GET ALL ITEMS (WITH SEARCH, ACTIVE FILTER, CATEGORY, DATE RANGE & PAGINATION) ===
  async getAllItems(query: {
    page?: number;
    take?: number;
    search?: string;
    isActive?: string;
    categoryId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      // === 1. Search by name ===
      if (query.search) {
        where.name = {
          contains: query.search,
        };
      }

      // === 2. Filter by category ===
      if (query.categoryId && query.categoryId !== "ALL") {
        where.categoryId = query.categoryId;
      }

      // === 3. Filter by active status ===
      if (query.isActive && query.isActive !== "ALL") {
        where.isActive = query.isActive === "true";
      }

      // === 4. Filter by Date Range (createdAt) ===
      if (query.startDate || query.endDate) {
        where.createdAt = {};

        if (query.startDate) {
          // gte: Greater Than or Equal (>=)
          where.createdAt.gte = new Date(query.startDate);
        }

        if (query.endDate) {
          // lte: Less Than or Equal (<=)
          const end = new Date(query.endDate);
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }

      // === Hitung total data ===
      const count = await this.prisma.vendorItem.count({ where });

      // === Ambil data dengan relasi category ===
      const data = await this.prisma.vendorItem.findMany({
        where,
        include: {
          category: true,
        },
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
      console.error("❌ Error in Get All Vendor Items:", error);
      throw new Error(
        "Failed to fetch vendor items. See server log for details.",
      );
    }
  }
  // === GET ALL ACTIVE VENDOR ITEMS ===
  async getActiveItems() {
    try {
      const data = await this.prisma.vendorItem.findMany({
        where: {
          isActive: true,
        },
      });

      return data;
    } catch (error) {
      console.error("❌ Error in Get Active Vendor Items:", error);
      throw new Error("Failed to fetch active vendor items");
    }
  }

  // === GET ITEM BY ID ===
  async getItemById(id: string) {
    const item = await this.prisma.vendorItem.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!item) throw new ApiError("Item not found", 404);
    return item;
  }

  // === UPDATE ITEM ===
  async updateItem(id: string, data: Partial<UpdateVendorItemDTO>) {
    const existing = await this.prisma.vendorItem.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!existing) throw new ApiError("Item not found", 404);

    let finalName = existing.name;
    let finalSlug = existing.slug;
    let finalCategoryId = data.categoryId ?? existing.categoryId;

    // === Jika user ubah kategori atau nama item ===
    if (data.name || data.categoryId) {
      const category = await this.prisma.vendorCategory.findUnique({
        where: { id: finalCategoryId },
      });

      if (!category) {
        throw new ApiError("Category not found", 404);
      }

      // Buat nama baru dengan format "Category - Item"
      const itemName =
        data.name ?? existing.name.split(" - ").pop() ?? existing.name;
      finalName = `${category.name} - ${itemName}`;
      finalSlug = this.slug.create(finalName);
    }

    const updated = await this.prisma.vendorItem.update({
      where: { id },
      data: {
        name: finalName,
        slug: finalSlug,
        description: data.description ?? existing.description,
        isActive: data.isActive ?? existing.isActive,
        categoryId: finalCategoryId,
      },
    });

    return updated;
  }

  // === SOFT DELETE ITEM ===
  async deleteItem(id: string) {
    const existing = await this.prisma.vendorItem.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Item not found", 404);

    const deleted = await this.prisma.vendorItem.update({
      where: { id },
      data: { isActive: false },
    });

    return deleted;
  }

  async exportVendorItemsToExcel(
    query: ItemVendorExportQuery,
  ): Promise<Buffer> {
    const { startDate, endDate, isActive, categoryId } = query;

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
    if (isActive && isActive !== "ALL") {
      where.isActive = isActive === "true";
    }

    // Filter by Category
    if (categoryId) {
      where.categoryId = categoryId;
    }

    // 2. MENGAMBIL DATA DARI DATABASE DENGAN RELASI
    const items = await this.prisma.vendorItem.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        category: {
          select: {
            name: true,
            type: true,
          },
        },
        vendors: {
          // Menghitung jumlah Vendor yang menggunakan Item ini
          select: {
            vendor: {
              select: {
                companyName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Vendor Items");

    // Menentukan Kolom (Headers)
    worksheet.columns = [
      { header: "ID (Partial)", key: "id", width: 12 },
      { header: "Nama Item", key: "name", width: 45 },
      { header: "Deskripsi", key: "description", width: 50 },
      { header: "Kategori", key: "categoryName", width: 30 },
      { header: "Tipe", key: "categoryType", width: 15 },
      { header: "Digunakan oleh Vendor", key: "vendorNames", width: 50 },
      { header: "Status Aktif", key: "isActive", width: 15 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    // Menambahkan Data Baris
    items.forEach((item) => {
      const vendorNamesString = item.vendors
        .map((v) => v.vendor.companyName)
        .join(", ");

      worksheet.addRow({
        id: item.id,
        name: item.name,
        description: item.description,
        categoryName: item.category.name,
        categoryType: item.category.type,
        vendorNames: vendorNamesString || "N/A",
        isActive: item.isActive ? "Ya" : "Tidak",
        createdAt: item.createdAt.toLocaleString("id-ID", {
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
        fgColor: { argb: "007FFF" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // 4. MENGHASILKAN BUFFER DAN MENGEMBALIKAN
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
