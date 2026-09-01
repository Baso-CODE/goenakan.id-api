import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  CreateItemCategoryDTO,
  UpdateItemCategoryDTO,
} from "./dto/item-category.dto";

export interface ItemCategoryExportQuery {
  startDate?: string;
  endDate?: string;
  productCategoryId?: string;
}

@injectable()
export class ItemCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === 1. GET ALL (WITH PAGINATION, SEARCH, & RELATIONS) ===
  async getAllItemCategories(query: {
    page?: number;
    take?: number;
    search?: string;
    productCategoryId?: string;
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

      if (query.productCategoryId) {
        where.productCategoryId = query.productCategoryId;
      }

      const count = await this.prisma.itemCategory.count({ where });
      const data = await this.prisma.itemCategory.findMany({
        where,
        skip,
        take,
        include: {
          productCategory: { select: { name_id: true } }, // Ambil nama kategori induk
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
      throw new ApiError("Failed to fetch item categories", 500);
    }
  }

  // === 2. CREATE ITEM CATEGORY (WITH AUTO-CODE) ===
  async createItemCategory(data: CreateItemCategoryDTO) {
    const baseSlug = this.slug.create(data.name);
    let finalSlug = baseSlug;
    let slugExists = await this.prisma.itemCategory.findUnique({
      where: { slug: finalSlug },
    });
    let slugCounter = 1;
    while (slugExists) {
      finalSlug = `${baseSlug}-${slugCounter}`;
      slugExists = await this.prisma.itemCategory.findUnique({
        where: { slug: finalSlug },
      });
      slugCounter++;
    }

    // 1. Ambil 3 huruf kapital pertama
    const prefix = data.name.substring(0, 3).toUpperCase();
    let generatedCode = prefix;

    // 2. Cek apakah kategori induk ada
    const parentExists = await this.prisma.productCategory.findUnique({
      where: { id: data.productCategoryId },
    });
    if (!parentExists) {
      throw new ApiError("Product Category (Parent) not found", 404);
    }

    // ✨ 3. LOGIKA PINTAR: Cek apakah kode sudah terpakai, jika ya tambahkan angka berurut
    let codeExists = await this.prisma.itemCategory.findUnique({
      where: { code: generatedCode },
    });

    let counter = 1;
    while (codeExists) {
      generatedCode = `${prefix}${counter}`; // Contoh: IPH1, IPH2, IPH3
      codeExists = await this.prisma.itemCategory.findUnique({
        where: { code: generatedCode },
      });
      counter++;
    }

    try {
      return await this.prisma.itemCategory.create({
        data: {
          name: data.name,
          slug: finalSlug,
          code: generatedCode, // ✨ Sekarang menggunakan kode yang pasti unik
          description: data.description,
          productCategoryId: data.productCategoryId,
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
        throw new ApiError("Item category name, code, or slug already exists", 400);
      }
      throw new ApiError("Failed to create item category", 500);
    }
  }
  // === 3. GET BY ID ===
  async getItemCategoryById(id: string) {
    const itemCategory = await this.prisma.itemCategory.findUnique({
      where: { id },
      include: { productCategory: true },
    });
    if (!itemCategory) throw new ApiError("Item category not found", 404);
    return itemCategory;
  }

  // === 4. UPDATE ITEM CATEGORY ===
  async updateItemCategory(id: string, data: UpdateItemCategoryDTO) {
    const existing = await this.getItemCategoryById(id);

    let finalSlug = existing.slug;
    let generatedCode = existing.code;

    if (data.name && data.name !== existing.name) {
      const baseSlug = this.slug.create(data.name);
      finalSlug = baseSlug;
      let slugExists = await this.prisma.itemCategory.findFirst({
        where: { slug: finalSlug, id: { not: id } },
      });
      let slugCounter = 1;
      while (slugExists) {
        finalSlug = `${baseSlug}-${slugCounter}`;
        slugExists = await this.prisma.itemCategory.findFirst({
          where: { slug: finalSlug, id: { not: id } },
        });
        slugCounter++;
      }

      const prefix = data.name.substring(0, 3).toUpperCase();
      generatedCode = prefix;
      let codeExists = await this.prisma.itemCategory.findFirst({
        where: { code: generatedCode, id: { not: id } },
      });
      let counter = 1;
      while (codeExists) {
        generatedCode = `${prefix}${counter}`;
        codeExists = await this.prisma.itemCategory.findFirst({
          where: { code: generatedCode, id: { not: id } },
        });
        counter++;
      }
    }

    // Lock: Jangan izinkan menonaktifkan item category jika masih ada produk aktif yang menggunakannya
    if (data.isActive !== undefined) {
      const targetActive =
        typeof data.isActive === "string"
          ? data.isActive === "true"
          : Boolean(data.isActive);
      if (!targetActive && existing.isActive) {
        const activeProductsCount = await this.prisma.product.count({
          where: {
            isActive: true,
            OR: [
              { itemCategoryId: id },
              { itemName: { itemCategoryId: id } },
            ],
          },
        });
        if (activeProductsCount > 0) {
          throw new ApiError(
            `Tidak dapat menonaktifkan item category ini karena masih digunakan oleh ${activeProductsCount} produk aktif. Nonaktifkan atau ubah kategori item pada produk-produk tersebut terlebih dahulu.`,
            400,
          );
        }
      }
    }

    try {
      return await this.prisma.itemCategory.update({
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
        throw new ApiError("Duplicate name or code", 400);
      throw new ApiError("Failed to update item category", 500);
    }
  }

  // === 5. DELETE ITEM CATEGORY (WITH PROTECTION) ===
  async deleteItemCategory(id: string) {
    const existing = await this.prisma.itemCategory.findUnique({
      where: { id },
      include: { _count: { select: { itemNames: true } } },
    });

    if (!existing) throw new ApiError("Item category not found", 404);

    // Jangan hapus jika sudah punya ItemName (Anak)
    if (existing._count.itemNames > 0) {
      throw new ApiError(
        "Cannot delete category that still has Item Names",
        400,
      );
    }

    return await this.prisma.itemCategory.delete({ where: { id } });
  }

  // === 6. EXCEL EXPORT ===
  async exportToExcel(query: ItemCategoryExportQuery): Promise<Buffer> {
    const where: any = {};
    if (query.productCategoryId)
      where.productCategoryId = query.productCategoryId;

    const data = await this.prisma.itemCategory.findMany({
      where,
      include: { productCategory: { select: { name_id: true } } },
      orderBy: { name: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Item Categories");

    worksheet.columns = [
      { header: "Parent Category", key: "parent", width: 25 },
      { header: "Item Category Name", key: "name", width: 30 },
      { header: "Code", key: "code", width: 10 },
      { header: "Slug", key: "slug", width: 30 },
    ];

    data.forEach((item) => {
      worksheet.addRow({
        parent: item.productCategory.name_id,
        name: item.name,
        code: item.code,
        slug: item.slug,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
