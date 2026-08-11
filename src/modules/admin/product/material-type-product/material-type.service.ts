import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  CreateMaterialTypeDTO,
  UpdateMaterialTypeDTO,
} from "./dto/material-type.dto";

export interface MaterialTypeExportQuery {
  startDate?: string;
  endDate?: string;
}

@injectable()
export class MaterialTypeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === GET ALL MATERIAL TYPES (WITH PAGINATION, SEARCH & DATE FILTER) ===
  async getAllMaterialTypes(query: {
    page?: number;
    take?: number;
    search?: string;
    startDate?: string; // ✨ Tambahkan ini
    endDate?: string; // ✨ Tambahkan ini
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      // 1. Logika Search
      if (query.search) {
        where.OR = [
          { name: { contains: query.search } },
          { description: { contains: query.search } },
        ];
      }

      // 2. ✨ Tambahkan Logika Filter Tanggal
      if (query.startDate || query.endDate) {
        where.createdAt = {};
        if (query.startDate) {
          where.createdAt.gte = new Date(query.startDate);
        }
        if (query.endDate) {
          const end = new Date(query.endDate);
          end.setHours(23, 59, 59, 999); // Set ke akhir hari agar data di tanggal tersebut terbawa
          where.createdAt.lte = end;
        }
      }

      const count = await this.prisma.materialType.count({ where });
      const data = await this.prisma.materialType.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      });

      const meta = this.pagination.generateMeta({ count, page, take });

      return { data, meta };
    } catch (error) {
      console.error("❌ Error in Get All Material Types:", error);
      throw new ApiError("Failed to fetch material types", 500);
    }
  }

  // === CREATE MATERIAL TYPE ===
  async createMaterialType(data: CreateMaterialTypeDTO) {
    const slug = this.slug.create(data.name);

    // Autogenerate code: Ambil 3 huruf pertama dan jadikan huruf kapital
    const generatedCode = data.name.substring(0, 3).toUpperCase();

    // Validasi Duplikasi Nama
    const existing = await this.prisma.materialType.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new ApiError("Material type name already exists", 400);
    }

    try {
      return await this.prisma.materialType.create({
        data: {
          name: data.name,
          slug: slug,
          code: generatedCode, // Menyimpan kode yang sudah di-generate
          description: data.description,
        },
      });
    } catch (error: any) {
      console.error("🔥 DATABASE ERROR:", error);

      // Menangkap error jika kebetulan ada kode (3 huruf) yang sama persis di database
      if (error.code === "P2002") {
        throw new ApiError(
          "Material code already exists. Please use a different name.",
          400,
        );
      }

      throw new ApiError("Failed to create material type", 500);
    }
  }
  // === GET BY ID ===
  async getMaterialTypeById(id: string) {
    const material = await this.prisma.materialType.findUnique({
      where: { id },
    });
    if (!material) throw new ApiError("Material type not found", 404);
    return material;
  }

  // === UPDATE MATERIAL TYPE ===
  async updateMaterialType(id: string, data: UpdateMaterialTypeDTO) {
    const existing = await this.prisma.materialType.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Material type not found", 404);

    const slug = data.name ? this.slug.create(data.name) : existing.slug;

    const generatedCode = data.name
      ? data.name.substring(0, 3).toUpperCase()
      : existing.code;

    // Cek duplikasi jika nama berubah
    if (data.name && data.name !== existing.name) {
      const duplicate = await this.prisma.materialType.findUnique({
        where: { name: data.name },
      });
      if (duplicate) throw new ApiError("Material name already used", 400);
    }

    try {
      return await this.prisma.materialType.update({
        where: { id },
        data: {
          name: data.name,
          slug: slug,
          code: generatedCode, // Memperbarui kode jika nama berubah
          description: data.description,
        },
      });
    } catch (error: any) {
      console.error("🔥 DATABASE UPDATE ERROR:", error);

      if (error.code === "P2002") {
        throw new ApiError(
          "Material code already exists. Please use a different name.",
          400,
        );
      }

      throw new ApiError("Failed to update material type", 500);
    }
  }

  // === DELETE MATERIAL TYPE ===
  async deleteMaterialType(id: string) {
    const existing = await this.prisma.materialType.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });

    if (!existing) throw new ApiError("Material type not found", 404);

    // Proteksi: Jangan hapus jika masih digunakan oleh produk
    if (existing._count.products > 0) {
      throw new ApiError(
        "Cannot delete material type that is still linked to products",
        400,
      );
    }

    return await this.prisma.materialType.delete({
      where: { id },
    });
  }

  // === GET LIST FOR DROPDOWN ===
  async getMaterialTypeList() {
    return await this.prisma.materialType.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });
  }

  // === EXCEL EXPORT ===
  async exportMaterialTypesToExcel(
    query: MaterialTypeExportQuery,
  ): Promise<Buffer> {
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

    const data = await this.prisma.materialType.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Material Types");

    worksheet.columns = [
      { header: "ID", key: "id", width: 15 },
      { header: "Material Name", key: "name", width: 30 },
      { header: "Slug", key: "slug", width: 30 },
      { header: "Description", key: "description", width: 40 },
      { header: "Created At", key: "createdAt", width: 25 },
    ];

    data.forEach((item) => {
      worksheet.addRow({
        id: item.id,
        name: item.name,
        slug: item.slug,
        description: item.description || "-",
        createdAt: item.createdAt.toLocaleString("id-ID"),
      });
    });

    // Styling
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "744d39" },
      }; // Warna Primary Anda
      cell.alignment = { horizontal: "center" };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
