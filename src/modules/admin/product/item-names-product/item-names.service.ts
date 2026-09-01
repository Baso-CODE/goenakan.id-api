import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateItemNameDTO, UpdateItemNameDTO } from "./dto/item-names.dto";

export interface ItemNameExportQuery {
  startDate?: string;
  endDate?: string;
  itemCategoryId?: string;
}

@injectable()
export class ItemNameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === 1. GET ALL (WITH PAGINATION, SEARCH, & FILTERS) ===
  async getAllItemNames(query: {
    page?: number;
    take?: number;
    search?: string;
    itemCategoryId?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: "insensitive" } },
          { code: { contains: query.search, mode: "insensitive" } },
        ];
      }

      if (query.itemCategoryId) {
        where.itemCategoryId = query.itemCategoryId;
      }

      const count = await this.prisma.itemName.count({ where });
      const data = await this.prisma.itemName.findMany({
        where,
        skip,
        take,
        include: {
          itemCategory: {
            select: {
              name: true,
              productCategory: { select: { name_id: true } },
            },
          },
          _count: {
            select: {
              products: {
                where: { isActive: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const meta = this.pagination.generateMeta({ count, page, take });
      return { data, meta };
    } catch (error) {
      throw new ApiError("Gagal mengambil data item name", 500);
    }
  }

  // === 2. CREATE ITEM NAME (WITH AUTO-CODE) ===
  async createItemName(data: CreateItemNameDTO) {
    const baseSlug = this.slug.create(data.name);
    let finalSlug = baseSlug;
    let slugExists = await this.prisma.itemName.findUnique({
      where: { slug: finalSlug },
    });
    let slugCounter = 1;
    while (slugExists) {
      finalSlug = `${baseSlug}-${slugCounter}`;
      slugExists = await this.prisma.itemName.findUnique({
        where: { slug: finalSlug },
      });
      slugCounter++;
    }

    // Autogenerate 3 huruf kapital pertama dengan penomoran jika bentrok
    const prefix = data.name.substring(0, 3).toUpperCase();
    let generatedCode = prefix;

    let codeExists = await this.prisma.itemName.findFirst({
      where: { code: generatedCode },
    });
    let counter = 1;
    while (codeExists) {
      generatedCode = `${prefix}${counter}`;
      codeExists = await this.prisma.itemName.findFirst({
        where: { code: generatedCode },
      });
      counter++;
    }

    // Validasi apakah kategori item induk ada
    const parentExists = await this.prisma.itemCategory.findUnique({
      where: { id: data.itemCategoryId },
    });
    if (!parentExists)
      throw new ApiError("Item Category (Parent) tidak ditemukan", 404);

    try {
      return await this.prisma.itemName.create({
        data: {
          name: data.name,
          slug: finalSlug,
          code: generatedCode,
          description: data.description,
          itemCategoryId: data.itemCategoryId,
          isActive:
            data.isActive !== undefined
              ? typeof data.isActive === "string"
                ? data.isActive === "true"
                : Boolean(data.isActive)
              : true,
        },
      });
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      if (error.code === "P2002") {
        throw new ApiError("Kode atau slug item name sudah digunakan", 400);
      }
      throw new ApiError("Gagal membuat item name", 500);
    }
  }

  // === 3. GET BY ID ===
  async getItemNameById(id: string) {
    const itemName = await this.prisma.itemName.findUnique({
      where: { id },
      include: { itemCategory: true },
    });
    if (!itemName) throw new ApiError("Item name tidak ditemukan", 404);
    return itemName;
  }

  // === 4. UPDATE ITEM NAME ===
  async updateItemName(id: string, data: UpdateItemNameDTO) {
    const existing = await this.getItemNameById(id);

    let finalSlug = existing.slug;
    let generatedCode = existing.code;

    if (data.name && data.name !== existing.name) {
      const baseSlug = this.slug.create(data.name);
      finalSlug = baseSlug;
      let slugExists = await this.prisma.itemName.findFirst({
        where: { slug: finalSlug, id: { not: id } },
      });
      let slugCounter = 1;
      while (slugExists) {
        finalSlug = `${baseSlug}-${slugCounter}`;
        slugExists = await this.prisma.itemName.findFirst({
          where: { slug: finalSlug, id: { not: id } },
        });
        slugCounter++;
      }

      const prefix = data.name.substring(0, 3).toUpperCase();
      generatedCode = prefix;
      let codeExists = await this.prisma.itemName.findFirst({
        where: { code: generatedCode, id: { not: id } },
      });
      let counter = 1;
      while (codeExists) {
        generatedCode = `${prefix}${counter}`;
        codeExists = await this.prisma.itemName.findFirst({
          where: { code: generatedCode, id: { not: id } },
        });
        counter++;
      }
    }

    // Lock: Jangan izinkan menonaktifkan item name jika masih ada produk aktif yang menggunakannya
    if (data.isActive !== undefined) {
      const targetActive =
        typeof data.isActive === "string"
          ? data.isActive === "true"
          : Boolean(data.isActive);
      if (!targetActive && existing.isActive) {
        const activeProductsCount = await this.prisma.product.count({
          where: {
            itemNameId: id,
            isActive: true,
          },
        });
        if (activeProductsCount > 0) {
          throw new ApiError(
            `Tidak dapat menonaktifkan item name ini karena masih digunakan oleh ${activeProductsCount} produk aktif. Nonaktifkan atau ubah item name pada produk-produk tersebut terlebih dahulu.`,
            400,
          );
        }
      }
    }

    try {
      return await this.prisma.itemName.update({
        where: { id },
        data: {
          ...data,
          slug: finalSlug,
          code: generatedCode,
          ...(data.isActive !== undefined
            ? {
                isActive:
                  typeof data.isActive === "string"
                    ? data.isActive === "true"
                    : Boolean(data.isActive),
              }
            : {}),
        },
      });
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      if (error.code === "P2002")
        throw new ApiError("Nama atau kode duplikat", 400);
      throw new ApiError("Gagal memperbarui item name", 500);
    }
  }

  // === 5. DELETE ITEM NAME (WITH PROTECTION) ===
  async deleteItemName(id: string) {
    const existing = await this.prisma.itemName.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });

    if (!existing) throw new ApiError("Item name tidak ditemukan", 404);

    // Proteksi: Jangan hapus jika sudah terhubung ke produk
    if (existing._count.products > 0) {
      throw new ApiError(
        "Tidak bisa menghapus item name yang masih digunakan oleh produk",
        400,
      );
    }

    return await this.prisma.itemName.delete({ where: { id } });
  }

  // === 6. EXCEL EXPORT ===
  async exportToExcel(query: ItemNameExportQuery): Promise<Buffer> {
    const where: any = {};
    if (query.itemCategoryId) where.itemCategoryId = query.itemCategoryId;

    const data = await this.prisma.itemName.findMany({
      where,
      include: { itemCategory: { select: { name: true } } },
      orderBy: { name: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Item Names");

    worksheet.columns = [
      { header: "Item Category", key: "parent", width: 25 },
      { header: "Item Name", key: "name", width: 30 },
      { header: "Code", key: "code", width: 10 },
      { header: "Slug", key: "slug", width: 30 },
    ];

    data.forEach((item) => {
      worksheet.addRow({
        parent: item.itemCategory.name,
        name: item.name,
        code: item.code,
        slug: item.slug,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
