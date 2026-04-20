import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { SlugService } from "../../../utils/genereateSlug";
import { CloudinaryService } from "../../cloudinary/cloudinary.service";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
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

  // === CREATE CATEGORY DENGAN UPLOAD IMAGE ===
  async createCategory(
    data: CreateProductCategoryDTO,
    file?: Express.Multer.File,
  ) {
    // 🔄 1. Buat slug dari nama bahasa Indonesia (sebagai default url)
    const slug = this.slug.create(data.name_id);

    // 🔄 2. Validasi keberadaan kategori menggunakan name_id
    const existing = await this.prisma.productCategory.findUnique({
      where: { name_id: data.name_id },
    });

    if (existing) {
      throw new ApiError("Category name already exists", 400);
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
          slug: slug,
          image: imageUrl,
          imageId: imageId,

          name_id: data.name_id,
          description_id: data.description_id,

          name_en: data.name_en,
          description_en: data.description_en,
        },
      });

      return category;
    } catch (error) {
      console.error("🔥 DATABASE ERROR:", error);
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

  // === UPDATE CATEGORY DENGAN IMAGE REPLACEMENT ===
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

    const slug =
      data.name_id && data.name_id !== existing.name_id
        ? this.slug.create(data.name_id)
        : existing.slug;

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

        // --- UPLOAD GAMBAR BARU ---
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

    // 4. Update Database
    try {
      const updated = await this.prisma.productCategory.update({
        where: { id },
        data: {
          slug: slug,
          image: imageUrl,
          imageId: imageId,

          name_id: data.name_id,
          name_en: data.name_en,
          description_id: data.description_id,
          description_en: data.description_en,
        },
      });

      return updated;
    } catch (error) {
      console.error("🔥 DATABASE UPDATE ERROR:", error);
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

  async getAllCategoriesList() {
    try {
      const categories = await this.prisma.productCategory.findMany({
        orderBy: {
          name_id: "asc",
        },
        select: {
          id: true,
          name_id: true,
          name_en: true,
        },
      });

      const formattedCategories = categories.map((cat) => ({
        id: cat.id,
        name: cat.name_id,
        name_en: cat.name_en,
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
        select: {
          id: true,
          slug: true,
          image: true,

          // 🔄 2. Ambil kedua versi bahasa dari database
          name_id: true,
          name_en: true,
          description_id: true,
          description_en: true,

          _count: {
            select: { products: true },
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
