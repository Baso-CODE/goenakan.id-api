import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { PaginationService } from "../../pagination/pagination.service";
import { ApiError } from "../../../utils/api-error";
import { SlugService } from "../../../utils/genereateSlug";
import { UpdateAttributeDTO } from "./dto/updateAttributes.dto";
import { CreateAttributeDTO } from "./dto/createAttributes.dto";
import * as ExcelJS from "exceljs";

export interface AttributeExportQuery {
  startDate?: string;
  endDate?: string;
  search?: string;
}
@injectable()
export class AttributeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === GET ALL ATTRIBUTES (WITH PAGINATION + SEARCH) ===
  async getAllAttributes(query: {
    page?: number;
    take?: number;
    search?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      // Search by name
      if (query.search) {
        where.name = {
          contains: query.search,
        };
      }

      const count = await this.prisma.attribute.count({ where });

      const data = await this.prisma.attribute.findMany({
        where,
        skip,
        take,
        include: {
          values: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const meta = this.pagination.generateMeta({
        count,
        page,
        take,
      });

      return { data, meta };
    } catch (error) {
      console.error("❌ Error in Get All Attributes:", error);
      throw new Error("Failed to fetch attributes. Check server log.");
    }
  }

  // === CREATE ATTRIBUTE (WITH VALUES) ===
  async createAttribute(data: CreateAttributeDTO) {
    const generatedSlug = this.slug.create(data.name);

    // Check duplicate slug
    const existingSlug = await this.prisma.attribute.findUnique({
      where: { slug: generatedSlug },
    });
    if (existingSlug) {
      throw new ApiError("Attribute slug already exists", 400);
    }

    // Pisahkan values
    const { values, name } = data;

    // Create Attribute + Values dalam 1 transaksi
    const attribute = await this.prisma.attribute.create({
      data: {
        name,
        slug: generatedSlug,
        values: {
          createMany: {
            data: values.map((v) => ({
              value: v.value,
            })),
          },
        },
      },
      include: {
        values: true,
      },
    });

    return attribute;
  }

  // === GET ATTRIBUTE BY ID ===
  async getAttributeById(id: string) {
    const attribute = await this.prisma.attribute.findUnique({
      where: { id },
      include: {
        values: true,
      },
    });

    if (!attribute) {
      throw new ApiError("Attribute not found", 404);
    }

    return attribute;
  }

  // === UPDATE ATTRIBUTE ===
  async updateAttribute(id: string, data: UpdateAttributeDTO) {
    console.log("ini adalah data", data);

    const existing = await this.prisma.attribute.findUnique({
      where: { id },
      include: { values: true },
    });

    if (!existing) {
      throw new ApiError("Attribute not found", 404);
    }

    // ===== HANDLE ATTRIBUTE NAME + SLUG =====
    const newSlug =
      data.name && data.name !== existing.name
        ? this.slug.create(data.name)
        : existing.slug;

    if (newSlug !== existing.slug) {
      const duplicateSlug = await this.prisma.attribute.findUnique({
        where: { slug: newSlug },
      });
      if (duplicateSlug) throw new ApiError("Slug already exists", 400);
    }

    const updateOps = [];

    // ===== UPDATE ATTRIBUTE BASIC DATA =====
    updateOps.push(
      this.prisma.attribute.update({
        where: { id },
        data: {
          name: data.name ?? existing.name,
          slug: newSlug,
        },
      }),
    );

    // ===== HANDLE VALUES (CREATE / UPDATE / DELETE =====
    if (data.values && data.values.length > 0) {
      for (const val of data.values) {
        // DELETE VALUE
        if (val.deleted && val.id) {
          updateOps.push(
            this.prisma.attributeValue.delete({
              where: { id: val.id },
            }),
          );
          continue;
        }

        // UPDATE VALUE
        if (val.id && !val.deleted) {
          updateOps.push(
            this.prisma.attributeValue.update({
              where: { id: val.id },
              data: { value: val.value },
            }),
          );
          continue;
        }

        // CREATE NEW VALUE
        if (!val.id) {
          updateOps.push(
            this.prisma.attributeValue.create({
              data: {
                value: val.value,
                attributeId: id,
              },
            }),
          );
        }
      }
    }

    // ===== EXECUTE ALL OPERATIONS IN ONE TRANSACTION =====
    await this.prisma.$transaction(updateOps);

    // Return updated attribute with values
    return await this.prisma.attribute.findUnique({
      where: { id },
      include: { values: true },
    });
  }

  // === DELETE ATTRIBUTE ===
  async deleteAttribute(id: string) {
    const existing = await this.prisma.attribute.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Attribute not found", 404);
    }

    const deleted = await this.prisma.attribute.delete({
      where: { id },
    });

    return deleted;
  }

  // === LIST ONLY (FOR DROPDOWN) ===
  async getAllAttributesList() {
    try {
      const attributes = await this.prisma.attribute.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          values: {
            select: {
              id: true,
              value: true,
            },
            orderBy: {
              value: "asc",
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      return attributes;
    } catch (error) {
      console.error("❌ Error in Get Attributes List:", error);
      throw new Error("Failed to fetch attribute list. Check server log.");
    }
  }

  async exportAttributesToExcel(query: AttributeExportQuery): Promise<Buffer> {
    const { startDate, endDate, search } = query;

    const where: any = {}; // Filter by Date Range (createdAt)

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // Tambahkan satu hari agar tanggal akhir inklusif
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.createdAt.lt = end;
      }
    } // Filter by Search (name or slug)

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
      ];
    } // 2. MENGAMBIL DATA DARI DATABASE DENGAN RELASI

    const attributes = await this.prisma.attribute.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true, // Ambil semua Attribute Values yang terkait
        values: {
          select: {
            value: true,
            id: true,
          },
          orderBy: { value: "asc" }, // Urutkan Value secara alfabetis
        }, // Hitung jumlah produk yang menggunakan Attribute ini (Opsional)
        _count: {
          select: { products: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }); // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Product Attributes");

    worksheet.columns = [
      { header: "ID (Partial)", key: "id", width: 12 },
      { header: "Nama Atribut", key: "name", width: 45 },
      { header: "Slug", key: "slug", width: 45 },
      { header: "Jumlah Values", key: "valueCount", width: 18 },
      { header: "List Values", key: "valuesList", width: 70 },
      { header: "Digunakan di Produk", key: "productCount", width: 25 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ]; // Menambahkan Data Baris

    attributes.forEach((attribute) => {
      const valuesListString = attribute.values
        .map((val) => `- ${val.value} (ID: ${val.id.substring(0, 8)})`)
        .join("\n");

      worksheet.addRow({
        id: attribute.id.substring(0, 8),
        name: attribute.name,
        slug: attribute.slug,
        valueCount: attribute.values.length,
        valuesList: valuesListString || "Tidak ada Value",
        productCount: attribute._count.products,
        createdAt: attribute.createdAt.toLocaleString("id-ID", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    }); // Styling Header

    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF9800" }, // Warna Oranye untuk Attributes
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Styling Kolom Values List (agar multiline berfungsi)
    worksheet
      .getColumn("valuesList")
      .eachCell({ includeEmpty: false }, (cell) => {
        cell.alignment = {
          wrapText: true,
          vertical: "top",
          horizontal: "left",
        };
      }); // 4. MENGHASILKAN BUFFER DAN MENGEMBALIKAN

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
