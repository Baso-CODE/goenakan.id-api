import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { translateWithDeepL } from "../../../../utils/deepl-translate";
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

  // ====================================================================
  // CREATE CATEGORY - DEEPL AUTO TRANSLATE + CLOUDINARY
  // ====================================================================
  async createCategory(
    data: CreateProductCategoryDTO,
    file?: Express.Multer.File,
  ) {
    // =====================================================
    // 1. GENERATE UNIQUE SLUG
    // =====================================================

    const baseSlug = this.slug.create(data.name_id);

    let finalSlug = baseSlug;
    let slugCounter = 1;

    while (
      await this.prisma.productCategory.findUnique({
        where: { slug: finalSlug },
        select: { id: true },
      })
    ) {
      finalSlug = `${baseSlug}-${slugCounter++}`;
    }

    // =====================================================
    // 2. GENERATE UNIQUE CATEGORY CODE
    // =====================================================

    const prefix = data.name_id.substring(0, 3).toUpperCase();

    let generatedCode = prefix;
    let counter = 1;

    while (
      await this.prisma.productCategory.findUnique({
        where: { code: generatedCode },
        select: { id: true },
      })
    ) {
      generatedCode = `${prefix}${counter++}`;
    }

    // =====================================================
    // 3. DEEPL AUTO TRANSLATION
    // =====================================================

    let finalNameEn: string | null = data.name_en?.trim() || null;

    let finalDescEn: string | null = data.description_en?.trim() || null;

    // Translate nama kategori jika EN kosong
    if (!finalNameEn && data.name_id?.trim()) {
      try {
        const translated = await translateWithDeepL(data.name_id.trim());

        finalNameEn = translated?.trim() || null;
      } catch (error) {
        console.warn("⚠️ DeepL category name translation failed:", error);
      }
    }

    // Translate deskripsi kategori jika EN kosong
    if (!finalDescEn && data.description_id?.trim()) {
      try {
        const translated = await translateWithDeepL(data.description_id);

        finalDescEn = translated?.trim() || null;
      } catch (error) {
        console.warn(
          "⚠️ DeepL category description translation failed:",
          error,
        );
      }
    }

    // =====================================================
    // 4. CLOUDINARY IMAGE UPLOAD
    // =====================================================

    let imageUrl = data.image;
    let imageId = data.imageId;

    let newImagePublicId: string | null = null;

    if (file) {
      try {
        const uploadResult = await this.cloudinary.upload(file, {
          folder: "products/categories",
          resource_type: "image",
        });

        imageUrl = uploadResult.secure_url;
        imageId = uploadResult.public_id;
        newImagePublicId = uploadResult.public_id;
      } catch (error) {
        console.error("🔥 CLOUDINARY UPLOAD ERROR:", error);

        throw new ApiError(
          "Failed to upload category image to Cloudinary",
          500,
        );
      }
    }

    // =====================================================
    // 5. CREATE CATEGORY
    // =====================================================

    try {
      const category = await this.prisma.productCategory.create({
        data: {
          slug: finalSlug,
          code: generatedCode,

          image: imageUrl,
          imageId,

          // Indonesian
          name_id: data.name_id,
          description_id: data.description_id,

          // English - manual or DeepL
          name_en: finalNameEn,
          description_en: finalDescEn,

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
      // Hapus gambar yang baru di-upload apabila
      // penyimpanan database gagal.
      if (newImagePublicId) {
        try {
          await this.cloudinary.delete(newImagePublicId);
        } catch (cleanupError) {
          console.warn("⚠️ Failed to cleanup category image:", cleanupError);
        }
      }

      console.error("🔥 CREATE CATEGORY DATABASE ERROR:", error);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error.code === "P2002") {
        throw new ApiError("Category slug or code already exists.", 400);
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

  // ====================================================================
  // UPDATE CATEGORY - SMART DEEPL + SAFE IMAGE REPLACEMENT
  // ====================================================================
  async updateCategory(
    id: string,
    data: Partial<UpdateProductCategoryDTO>,
    file?: Express.Multer.File,
  ) {
    // =====================================================
    // 1. GET EXISTING CATEGORY
    // =====================================================

    const existing = await this.prisma.productCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Category not found", 404);
    }

    // =====================================================
    // 2. GENERATE SLUG & CATEGORY CODE
    // =====================================================

    let finalSlug = existing.slug;
    let generatedCode = existing.code;

    const nameIdChanged =
      data.name_id !== undefined && data.name_id !== existing.name_id;

    if (nameIdChanged && data.name_id) {
      const baseSlug = this.slug.create(data.name_id);

      finalSlug = baseSlug;

      let slugCounter = 1;

      while (
        await this.prisma.productCategory.findFirst({
          where: {
            slug: finalSlug,
            id: { not: id },
          },
          select: { id: true },
        })
      ) {
        finalSlug = `${baseSlug}-${slugCounter++}`;
      }

      const prefix = data.name_id.substring(0, 3).toUpperCase();

      generatedCode = prefix;

      let counter = 1;

      while (
        await this.prisma.productCategory.findFirst({
          where: {
            code: generatedCode,
            id: { not: id },
          },
          select: { id: true },
        })
      ) {
        generatedCode = `${prefix}${counter++}`;
      }
    }

    // =====================================================
    // 3. SMART DEEPL TRANSLATION
    // =====================================================

    const effectiveNameId =
      data.name_id !== undefined ? data.name_id : existing.name_id;

    const effectiveDescId =
      data.description_id !== undefined
        ? data.description_id
        : existing.description_id;

    const descIdChanged =
      data.description_id !== undefined &&
      data.description_id !== existing.description_id;

    // Helper untuk memprioritaskan input manual,
    // melakukan auto-translate bila diperlukan,
    // dan mempertahankan data lama jika DeepL gagal.
    const resolveEnglishValue = async (
      sourceText: string | null | undefined,
      manualEnglish: string | null | undefined,
      existingEnglish: string | null | undefined,
      sourceChanged: boolean,
      fieldName: string,
    ): Promise<string | null> => {
      const currentEn = existingEnglish?.trim() || null;
      const manualEn = manualEnglish?.trim() || "";

      // Jika admin memasukkan EN baru yang berbeda,
      // gunakan nilai manual.
      if (manualEn && manualEn !== currentEn) {
        return manualEn;
      }

      // Jika sumber Indonesia dikosongkan,
      // kosongkan versi EN kecuali ada input manual baru.
      if (!sourceText?.trim()) {
        if (sourceChanged) {
          return null;
        }

        if (manualEnglish !== undefined) {
          return manualEn || null;
        }

        return currentEn;
      }

      // Translate ketika:
      // 1. Teks Indonesia berubah.
      // 2. Admin mengosongkan field Inggris.
      // 3. Versi Inggris belum ada dan field terkait dikirim.
      const shouldTranslate =
        sourceChanged ||
        (manualEnglish !== undefined && !manualEn) ||
        (manualEnglish !== undefined && !currentEn);

      if (!shouldTranslate) {
        return currentEn;
      }

      try {
        const translated = await translateWithDeepL(sourceText);

        return translated?.trim() || currentEn;
      } catch (error) {
        console.warn(`⚠️ DeepL ${fieldName} translation failed:`, error);

        return currentEn;
      }
    };

    const [finalNameEn, finalDescEn] = await Promise.all([
      resolveEnglishValue(
        effectiveNameId,
        data.name_en,
        existing.name_en,
        nameIdChanged,
        "category name",
      ),
      resolveEnglishValue(
        effectiveDescId,
        data.description_en,
        existing.description_en,
        descIdChanged,
        "category description",
      ),
    ]);

    // =====================================================
    // 4. LOCK CATEGORY ACTIVE STATUS
    // =====================================================

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

    // =====================================================
    // 5. PREPARE IMAGE
    // =====================================================

    // Gunakan gambar existing sebagai default.
    let imageUrl = data.image !== undefined ? data.image : existing.image;

    let imageId = data.imageId !== undefined ? data.imageId : existing.imageId;

    let newImagePublicId: string | null = null;

    if (file) {
      try {
        const uploadResult = await this.cloudinary.upload(file, {
          folder: "products/categories",
          resource_type: "image",
        });

        imageUrl = uploadResult.secure_url;
        imageId = uploadResult.public_id;

        newImagePublicId = uploadResult.public_id;
      } catch (error) {
        console.error("🔥 CLOUDINARY UPDATE ERROR:", error);

        throw new ApiError("Failed to update image on Cloudinary", 500);
      }
    }

    // =====================================================
    // 6. UPDATE DATABASE
    // =====================================================

    let updated;

    try {
      updated = await this.prisma.productCategory.update({
        where: { id },

        data: {
          slug: finalSlug,
          code: generatedCode,

          // Image
          image: imageUrl,
          imageId,

          // Indonesian
          name_id: data.name_id !== undefined ? data.name_id : existing.name_id,

          description_id:
            data.description_id !== undefined
              ? data.description_id
              : existing.description_id,

          // English - manual or DeepL
          name_en: finalNameEn,
          description_en: finalDescEn,

          // Active status
          ...(data.isActive !== undefined && {
            isActive:
              typeof data.isActive === "string"
                ? data.isActive === "true"
                : Boolean(data.isActive),
          }),
        },
      });
    } catch (error: any) {
      // Jika DB gagal, hapus gambar baru.
      // Gambar lama masih aman.
      if (newImagePublicId) {
        try {
          await this.cloudinary.delete(newImagePublicId);
        } catch (cleanupError) {
          console.warn(
            "⚠️ Failed to cleanup new category image:",
            cleanupError,
          );
        }
      }

      console.error("🔥 DATABASE UPDATE ERROR:", error);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error.code === "P2002") {
        throw new ApiError("Category slug or code already exists.", 400);
      }

      throw new ApiError("Failed to update product category in database", 500);
    }

    // =====================================================
    // 7. CLEANUP OLD IMAGE AFTER DB SUCCESS
    // =====================================================

    if (
      newImagePublicId &&
      existing.imageId &&
      existing.imageId !== newImagePublicId
    ) {
      try {
        await this.cloudinary.delete(existing.imageId);
      } catch (error) {
        console.warn("⚠️ Failed to delete old category image:", error);
      }
    }

    return updated;
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
