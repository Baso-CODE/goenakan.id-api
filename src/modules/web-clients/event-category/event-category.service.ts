import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { SlugService } from "../../../utils/genereateSlug";
import { CloudinaryService } from "../../cloudinary/cloudinary.service";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateEventCategoryDTO,
  UpdateEventCategoryDTO,
} from "./dto/event-category.dto";

@injectable()
export class EventCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly slug: SlugService,
    private readonly pagination: PaginationService,
  ) {}

  // ====================================================================
  // 1. GET ALL FOR ADMIN (With Pagination & Search)
  // ====================================================================
  async getAllEventCategories(query: {
    page?: number;
    take?: number;
    search?: string;
  }) {
    const where: any = {};
    if (query.search) {
      where.title = { contains: query.search, mode: "insensitive" };
    }

    const count = await this.prisma.eventCategory.count({ where });
    const data = await this.prisma.eventCategory.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { displayOrder: "asc" },
    });

    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 10),
    });

    return { data, meta };
  }

  // ====================================================================
  // 2. GET BY ID
  // ====================================================================
  async getEventCategoryById(id: string) {
    const category = await this.prisma.eventCategory.findUnique({
      where: { id },
    });
    if (!category) throw new ApiError("Event Category not found", 404);
    return category;
  }

  // ====================================================================
  // 3. CREATE EVENT CATEGORY
  // ====================================================================
  async createEventCategory(
    data: CreateEventCategoryDTO,
    file: Express.Multer.File,
  ) {
    if (!file) throw new ApiError("Event category image is required", 400);

    const slug = this.slug.create(data.title);
    let uploadResult;

    // --- UPLOAD KE CLOUDINARY ---
    try {
      uploadResult = await this.cloudinary.upload(file, {
        folder: "event_categories",
      });
    } catch (error: any) {
      console.error("🔥 CLOUDINARY UPLOAD ERROR:", error);
      throw new ApiError(`Gagal upload gambar: ${error.message}`, 500);
    }

    // --- INSERT KE DATABASE ---
    try {
      const newCategory = await this.prisma.eventCategory.create({
        data: {
          title: data.title,
          slug,
          // ✨ PERBAIKAN: Gunakan pengecekan !== undefined agar angka 0 tetap terbaca dengan benar
          orderCount:
            data.orderCount !== undefined ? Number(data.orderCount) : 0,
          displayOrder:
            data.displayOrder !== undefined ? Number(data.displayOrder) : 0,
          isActive:
            data.isActive !== undefined
              ? String(data.isActive) === "true"
              : true,

          image: uploadResult.secure_url,
          imageId: uploadResult.public_id,
        },
      });

      return newCategory;
    } catch (error: any) {
      // ⚠️ ROLLBACK: Jika DB gagal, hapus gambar yang baru saja diupload ke Cloudinary
      if (uploadResult?.public_id) {
        await this.cloudinary.delete(uploadResult.public_id).catch(() => null);
      }

      console.error("🔥 DATABASE INSERT ERROR:", error);

      if (error.code === "P2002") {
        throw new ApiError(
          `Kategori event "${data.title}" sudah ada (Slug duplikat).`,
          400,
        );
      }

      throw new ApiError(
        "Terjadi kesalahan saat menyimpan data ke database.",
        500,
      );
    }
  }

  // ====================================================================
  // 4. UPDATE EVENT CATEGORY
  // ====================================================================
  async updateEventCategory(
    id: string,
    data: UpdateEventCategoryDTO,
    file?: Express.Multer.File,
  ) {
    const existing = await this.getEventCategoryById(id);

    let imageUrl = existing.image;
    let imageId = existing.imageId;

    // --- JIKA ADA FILE BARU ---
    if (file) {
      try {
        // 1. Hapus file lama
        if (existing.imageId) {
          await this.cloudinary.delete(existing.imageId).catch(() => null);
        }

        // 2. Upload file baru
        const uploadResult = await this.cloudinary.upload(file, {
          folder: "event_categories",
        });
        imageUrl = uploadResult.secure_url;
        imageId = uploadResult.public_id;
      } catch (error: any) {
        console.error("🔥 CLOUDINARY UPDATE ERROR:", error);
        throw new ApiError(`Gagal memperbarui gambar: ${error.message}`, 500);
      }
    }

    // --- UPDATE DATABASE ---
    try {
      const slug =
        data.title && data.title !== existing.title
          ? this.slug.create(data.title)
          : existing.slug;

      const updatedCategory = await this.prisma.eventCategory.update({
        where: { id },
        data: {
          title: data.title,
          slug,
          orderCount:
            data.orderCount !== undefined
              ? Number(data.orderCount)
              : existing.orderCount,
          image: imageUrl,
          imageId: imageId,
          displayOrder:
            data.displayOrder !== undefined
              ? Number(data.displayOrder)
              : existing.displayOrder,
          isActive:
            data.isActive !== undefined
              ? String(data.isActive) === "true"
              : existing.isActive,
        },
      });

      return updatedCategory;
    } catch (error: any) {
      console.error("🔥 DATABASE UPDATE ERROR:", error);

      if (error.code === "P2002") {
        throw new ApiError("Kategori event tersebut sudah ada.", 400);
      }

      throw new ApiError(
        "Terjadi kesalahan saat memperbarui data di database.",
        500,
      );
    }
  }

  // ====================================================================
  // 5. DELETE EVENT CATEGORY
  // ====================================================================
  async deleteEventCategory(id: string) {
    const existing = await this.getEventCategoryById(id);

    try {
      // 1. Hapus gambar dari Cloudinary
      if (existing.imageId) {
        await this.cloudinary.delete(existing.imageId);
      }

      // 2. Hapus data dari Database
      return await this.prisma.eventCategory.delete({ where: { id } });
    } catch (error: any) {
      console.error("🔥 DELETE ERROR:", error);
      throw new ApiError("Gagal menghapus kategori event dari sistem.", 500);
    }
  }

  // ====================================================================
  // 6. GET PUBLIC EVENT CATEGORIES (Untuk Carousel di Landing Page)
  // ====================================================================
  async getPublicEventCategories() {
    try {
      return await this.prisma.eventCategory.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          orderCount: true,
          image: true,
        },
      });
    } catch (error) {
      throw new ApiError("Gagal mengambil data kategori event publik.", 500);
    }
  }

  // ====================================================================
  // 7. GET PUBLIC EVENT CATEGORY BY SLUG (Menampilkan Detail & Children)
  // ====================================================================
  async getPublicEventCategoryBySlug(slug: string) {
    try {
      const category = await this.prisma.eventCategory.findFirst({
        where: {
          slug: slug,
          isActive: true,
        },
        include: {
          portfolios: {
            where: { isActive: true },
            orderBy: { displayOrder: "asc" },
            select: {
              id: true,
              title: true,
              slug: true,
              clientName: true,
              image: true,
              orderQuantity: true,
              projectDate: true,
            },
          },
        },
      });

      if (!category) {
        throw new ApiError("Kategori event tidak ditemukan.", 404);
      }

      return category;
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      throw new ApiError("Gagal mengambil detail kategori event.", 500);
    }
  }

  // ====================================================================
  // GET EVENT CATEGORY LIST (Untuk Dropdown di Form Portfolio)
  // ====================================================================
  async getEventCategoryList() {
    try {
      return await this.prisma.eventCategory.findMany({
        where: { isActive: true }, // Hanya ambil kategori yang aktif
        select: {
          id: true,
          title: true,
        },
        orderBy: { title: "asc" }, // Urutkan sesuai abjad
      });
    } catch (error) {
      throw new ApiError("Gagal mengambil daftar kategori event.", 500);
    }
  }
}
