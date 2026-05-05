import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { SlugService } from "../../../utils/genereateSlug";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
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
    const slug = this.slug.create(data.name);

    // Autogenerate 3 huruf kapital pertama
    const generatedCode = data.name.substring(0, 3).toUpperCase();

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
          slug,
          code: generatedCode,
          description: data.description,
          itemCategoryId: data.itemCategoryId,
        },
      });
    } catch (error: any) {
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

    const slug = data.name ? this.slug.create(data.name) : existing.slug;
    const code = data.name
      ? data.name.substring(0, 3).toUpperCase()
      : existing.code;

    try {
      return await this.prisma.itemName.update({
        where: { id },
        data: {
          ...data,
          slug,
          code,
        },
      });
    } catch (error: any) {
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
