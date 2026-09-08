import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { CloudinaryService } from "../../../cloudinary/cloudinary.service";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateProductCategoryDTO } from "./dto/createCategoryProduct.dto";
import { UpdateProductCategoryDTO } from "./dto/updateCategoryProduct.dto";

export interface CategoryProductsExportQuery {
  startDate?: string;
  endDate?: string;
}
@injectable()
export class ProductCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // === GET ALL ACTIVE CATEGORIES (WITH PAGINATION) ===
  async getAllCategories(query: {
    page?: number;
    take?: number;
    search?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      // === Search by name ===
      if (query.search) {
        where.name = {
          contains: query.search,
        };
      }

      // === Total data untuk pagination ===
      const count = await this.prisma.productCategory.count({ where });

      // === Ambil data kategori ===
      const data = await this.prisma.productCategory.findMany({
        where,
        skip,
        take,
        include: {
          _count: {
            select: {
              products: {
                where: { isActive: true },
              },
            },
          },
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
      console.error("❌ Error in Get All Product Categories:", error);
      throw new Error(
        "Failed to fetch product categories. See server log for details.",
      );
    }
  }

  // === CREATE CATEGORY DENGAN UPLOAD IMAGE & AUTO-CODE ===
  async createCategory(
    data: CreateProductCategoryDTO,
    file?: Express.Multer.File,
  ) {
    const baseSlug = this.slug.create(data.name_id);
    let finalSlug = baseSlug;
    let slugExists = await this.prisma.productCategory.findUnique({
      where: { slug: finalSlug },
    });
    let slugCounter = 1;
    while (slugExists) {
      finalSlug = `${baseSlug}-${slugCounter}`;
      slugExists = await this.prisma.productCategory.findUnique({
        where: { slug: finalSlug },
      });
      slugCounter++;
    }

    const prefix = data.name_id.substring(0, 3).toUpperCase();
    let generatedCode = prefix;

    let codeExists = await this.prisma.productCategory.findUnique({
      where: { code: generatedCode },
    });
    let counter = 1;
    while (codeExists) {
      generatedCode = `${prefix}${counter}`;
      codeExists = await this.prisma.productCategory.findUnique({
        where: { code: generatedCode },
      });
      counter++;
    }

    let imageUrl = data.image;
    let imageId = data.imageId;

    if (file) {
      try {
        const uploadResult = await this.cloudinary.upload(file, {
          folder: "products/categories",
          resource_type: "image",
        });
        imageUrl = uploadResult.secure_url;
        imageId = uploadResult.public_id;
      } catch (error) {
        console.error("🔥 CLOUDINARY UPLOAD ERROR:", error);
        throw new ApiError(
          "Failed to upload category image to Cloudinary",
          500,
        );
      }
    }

    // 4. Simpan ke Database
    try {
      const category = await this.prisma.productCategory.create({
        data: {
          slug: finalSlug,
          code: generatedCode, // Menyimpan kode otomatis
          image: imageUrl,
          imageId: imageId,

          name_id: data.name_id,
          description_id: data.description_id,

          name_en: data.name_en,
          description_en: data.description_en,
          isActive:
            data.isActive !== undefined
              ? typeof data.isActive === "string"
                ? data.isActive === "true"
                : Boolean(data.isActive)
              : true,
        },
      });

      return category;
    } catch (error: any) {
      console.error("🔥 DATABASE ERROR:", error);
      // Cek jika terjadi error duplikasi code (P2002 di Prisma)
      if (error.code === "P2002") {
        throw new ApiError(
          `Category code "${generatedCode}" is already taken.`,
          400,
        );
      }
      throw new ApiError("Failed to create product category in database", 500);
    }
  }

  // === GET CATEGORY BY ID ===
  async getCategoryById(id: string) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
    });
    if (!category) throw new ApiError("Category not found", 404);
    return category;
  }

  // === UPDATE CATEGORY DENGAN IMAGE REPLACEMENT & CODE UPDATE ===
  async updateCategory(
    id: string,
    data: Partial<UpdateProductCategoryDTO>,
    file?: Express.Multer.File,
  ) {
    // 1. Cek keberadaan kategori
    const existing = await this.prisma.productCategory.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Category not found", 404);

    let finalSlug = existing.slug;
    let generatedCode = existing.code;

    if (data.name_id && data.name_id !== existing.name_id) {
      const baseSlug = this.slug.create(data.name_id);
      finalSlug = baseSlug;
      let slugExists = await this.prisma.productCategory.findFirst({
        where: { slug: finalSlug, id: { not: id } },
      });
      let slugCounter = 1;
      while (slugExists) {
        finalSlug = `${baseSlug}-${slugCounter}`;
        slugExists = await this.prisma.productCategory.findFirst({
          where: { slug: finalSlug, id: { not: id } },
        });
        slugCounter++;
      }

      const prefix = data.name_id.substring(0, 3).toUpperCase();
      generatedCode = prefix;
      let codeExists = await this.prisma.productCategory.findFirst({
        where: { code: generatedCode, id: { not: id } },
      });
      let counter = 1;
      while (codeExists) {
        generatedCode = `${prefix}${counter}`;
        codeExists = await this.prisma.productCategory.findFirst({
          where: { code: generatedCode, id: { not: id } },
        });
        counter++;
      }
    }

    let imageUrl = data.image;
    let imageId = data.imageId;

    if (file) {
      try {
        if (existing.imageId) {
          await this.cloudinary.delete(existing.imageId).catch((err) => {
            console.warn(
              `⚠️ Gagal menghapus gambar lama ${existing.imageId}:`,
              err,
            );
          });
        }

        const uploadResult = await this.cloudinary.upload(file, {
          folder: "products/categories",
          resource_type: "image",
        });
        imageUrl = uploadResult.secure_url;
        imageId = uploadResult.public_id;
      } catch (error) {
        throw new ApiError("Failed to update image on Cloudinary", 500);
      }
    }

    // Lock: Jangan izinkan menonaktifkan kategori jika masih ada produk aktif yang menggunakannya
    if (data.isActive !== undefined) {
      const targetActive =
        typeof data.isActive === "string"
          ? data.isActive === "true"
          : Boolean(data.isActive);
      if (!targetActive && existing.isActive) {
        const activeProductsCount = await this.prisma.product.count({
          where: {
            categoryId: id,
            isActive: true,
          },
        });
        if (activeProductsCount > 0) {
          throw new ApiError(
            `Tidak dapat menonaktifkan kategori ini karena masih digunakan oleh ${activeProductsCount} produk aktif. Nonaktifkan atau ubah kategori produk-produk tersebut terlebih dahulu.`,
            400,
          );
        }
      }
    }

    // 4. Update Database
    try {
      const updated = await this.prisma.productCategory.update({
        where: { id },
        data: {
          slug: finalSlug,
          code: generatedCode, // Update kode jika nama berubah
          image: imageUrl,
          imageId: imageId,

          name_id: data.name_id,
          name_en: data.name_en,
          description_id: data.description_id,
          description_en: data.description_en,
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

      return updated;
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      console.error("🔥 DATABASE UPDATE ERROR:", error);
      if (error.code === "P2002") {
        throw new ApiError(`Category code already exists.`, 400);
      }
      throw new ApiError("Failed to update product category in database", 500);
    }
  }

  // === SOFT DELETE CATEGORY ===
  async deleteCategory(id: string) {
    const existing = await this.prisma.productCategory.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Category not found", 404);

    const deleted = await this.prisma.productCategory.delete({
      where: { id },
    });

    return deleted;
  }

  // === GET ALL CATEGORIES LIST WITH ITEMS ===
  async getAllCategoriesList(lang: string = "id") {
    try {
      const categories = await this.prisma.productCategory.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          name_id: "asc",
        },
        select: {
          id: true,
          name_id: true,
          name_en: true,
          code: true,
          itemCategories: {
            where: {
              isActive: true,
            },
            select: {
              id: true,
              name: true,
              itemNames: {
                where: {
                  isActive: true,
                },
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: {
              name: "asc",
            },
          },
        },
      });

      // ✨ Format ulang data berdasarkan bahasa yang dipilih (lang)
      const formattedCategories = categories.map((cat) => ({
        id: cat.id,
        name: lang === "en" && cat.name_en ? cat.name_en : cat.name_id,
        name_en: cat.name_en, // Tetap disertakan jika dibutuhkan komponen lain
        code: cat.code,
        itemCategories: cat.itemCategories,
      }));

      return formattedCategories;
    } catch (error) {
      console.error("❌ Error in Get All Categories List:", error);
      throw new Error(
        "Failed to fetch product categories list. See server log for details.",
      );
    }
  }

  async exportCategoryProductsToExcel(
    query: CategoryProductsExportQuery,
  ): Promise<Buffer> {
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
    const worksheet = workbook.addWorksheet("Data Department Client");

    // Menentukan Kolom (Headers) sesuai skema VendorCategory
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Nama Category Product ", key: "name", width: 30 },
      { header: "Slug", key: "slug", width: 25 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    // Menambahkan Data Baris
    categories.forEach((department) => {
      worksheet.addRow({
        id: department.id,
        name: department.name,
        slug: department.slug,
        createdAt: department.createdAt.toLocaleString("id-ID", {
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

  async getPublicCategories(lang: string = "id") {
    try {
      const categories = await this.prisma.productCategory.findMany({
        where: {
          isActive: true,
        },
        select: {
          id: true,
          slug: true,
          image: true,

          name_id: true,
          name_en: true,
          description_id: true,
          description_en: true,

          _count: {
            select: { products: { where: { isActive: true } } },
          },
        },
        orderBy: {
          name_id: "asc", // 🔄 Urutkan berdasarkan nama default
        },
      });

      // 🔄 3. Format/Mapping data sebelum dikembalikan
      const formattedCategories = categories.map((cat) => {
        // Tentukan nama dan deskripsi berdasarkan bahasa yang direquest
        const finalName =
          lang === "en" && cat.name_en ? cat.name_en : cat.name_id;
        const finalDescription =
          lang === "en" && cat.description_en
            ? cat.description_en
            : cat.description_id;

        return {
          id: cat.id,
          slug: cat.slug,
          image: cat.image,
          name: finalName,
          description: finalDescription,
          _count: cat._count,
        };
      });

      return formattedCategories;
    } catch (error) {
      console.error("🔥 Gagal mengambil kategori publik:", error);
      throw new ApiError("Failed to fetch categories", 500);
    }
  }
}
