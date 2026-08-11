import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { CloudinaryService } from "../../../cloudinary/cloudinary.service";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateBannerDto, UpdateBannerDto } from "./dto/banner-product.dto";

@injectable()
export class BannerProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly pagination: PaginationService,
  ) {}

  // ====================================================================
  // 1. GET ALL FOR ADMIN (With Pagination, Search, Status & Date Filter)
  // ====================================================================
  async getAllBanners(query: {
    page?: number;
    take?: number;
    search?: string;
    isActive?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const where: any = {};

    // Filter Pencarian (Judul atau Subjudul)
    if (query.search) {
      where.OR = [
        { title: { contains: query.search } },
        { subtitle: { contains: query.search } },
      ];
    }

    // Filter Status Aktif
    if (query.isActive && query.isActive !== "ALL") {
      where.isActive = query.isActive === "true";
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const count = await this.prisma.heroBannerProduct.count({ where });
    const data = await this.prisma.heroBannerProduct.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { sortOrder: "asc" },
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
  async getBannerById(id: string) {
    const banner = await this.prisma.heroBannerProduct.findUnique({
      where: { id },
    });
    if (!banner) throw new ApiError("Banner not found", 404);
    return banner;
  }

  // ====================================================================
  // 3. CREATE BANNER
  // ====================================================================
  async createBanner(data: CreateBannerDto, file: Express.Multer.File) {
    if (!file) throw new ApiError("Banner image is required", 400);

    let uploadResult;

    // --- UPLOAD KE CLOUDINARY ---
    try {
      uploadResult = await this.cloudinary.upload(file, {
        folder: "banners",
      });
    } catch (error: any) {
      console.error("🔥 CLOUDINARY UPLOAD ERROR:", error);
      throw new ApiError(`Gagal upload gambar banner: ${error.message}`, 500);
    }

    // --- INSERT KE DATABASE ---
    try {
      const newBanner = await this.prisma.heroBannerProduct.create({
        data: {
          title: data.title || null,
          subtitle: data.subtitle || null,
          linkUrl: data.linkUrl || null,
          imageUrl: uploadResult.secure_url,
          imagePublicId: uploadResult.public_id,
          isActive:
            data.isActive !== undefined
              ? String(data.isActive) === "true"
              : true,
          sortOrder: Number(data.sortOrder || 0),
        },
      });

      return newBanner;
    } catch (error: any) {
      // Rollback gambar jika database gagal
      if (uploadResult?.public_id) {
        await this.cloudinary.delete(uploadResult.public_id).catch(() => null);
      }

      console.error("🔥 DATABASE INSERT ERROR:", error);
      throw new ApiError(
        "Terjadi kesalahan saat menyimpan data banner ke database.",
        500,
      );
    }
  }

  // ====================================================================
  // 4. UPDATE BANNER
  // ====================================================================
  async updateBanner(
    id: string,
    data: UpdateBannerDto,
    file?: Express.Multer.File,
  ) {
    const existing = await this.getBannerById(id);

    let imageUrl = existing.imageUrl;
    let imagePublicId = existing.imagePublicId;

    // --- JIKA ADA FILE BARU ---
    if (file) {
      try {
        // 1. Hapus file lama di Cloudinary
        if (existing.imagePublicId) {
          await this.cloudinary
            .delete(existing.imagePublicId)
            .catch(() => null);
        }

        // 2. Upload file baru
        const uploadResult = await this.cloudinary.upload(file, {
          folder: "banners",
        });
        imageUrl = uploadResult.secure_url;
        imagePublicId = uploadResult.public_id;
      } catch (error: any) {
        console.error("🔥 CLOUDINARY UPDATE ERROR:", error);
        throw new ApiError(
          `Gagal memperbarui gambar banner: ${error.message}`,
          500,
        );
      }
    }

    // --- UPDATE DATABASE ---
    try {
      const updatedBanner = await this.prisma.heroBannerProduct.update({
        where: { id },
        data: {
          title: data.title !== undefined ? data.title : existing.title,
          subtitle:
            data.subtitle !== undefined ? data.subtitle : existing.subtitle,
          linkUrl: data.linkUrl !== undefined ? data.linkUrl : existing.linkUrl,
          isActive:
            data.isActive !== undefined
              ? String(data.isActive) === "true"
              : existing.isActive,
          sortOrder:
            data.sortOrder !== undefined
              ? Number(data.sortOrder)
              : existing.sortOrder,
          imageUrl: imageUrl,
          imagePublicId: imagePublicId,
        },
      });

      return updatedBanner;
    } catch (error: any) {
      console.error("🔥 DATABASE UPDATE ERROR:", error);
      throw new ApiError(
        "Terjadi kesalahan saat memperbarui data banner di database.",
        500,
      );
    }
  }

  // ====================================================================
  // 5. DELETE BANNER
  // ====================================================================
  async deleteBanner(id: string) {
    const existing = await this.getBannerById(id);

    try {
      // 1. Hapus gambar dari Cloudinary
      if (existing.imagePublicId) {
        await this.cloudinary.delete(existing.imagePublicId);
      }

      // 2. Hapus data dari Database
      return await this.prisma.heroBannerProduct.delete({ where: { id } });
    } catch (error: any) {
      console.error("🔥 DELETE ERROR:", error);
      throw new ApiError("Gagal menghapus banner dari sistem.", 500);
    }
  }

  // ====================================================================
  // 6. GET PUBLIC BANNERS (Untuk Carousel di Landing Page)
  // ====================================================================
  async getPublicBanners() {
    try {
      return await this.prisma.heroBannerProduct.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          subtitle: true,
          imageUrl: true,
          linkUrl: true,
          // Tidak perlu mengirim createdAt/updatedAt/imagePublicId ke frontend publik
        },
      });
    } catch (error) {
      throw new ApiError("Gagal mengambil data banner publik.", 500);
    }
  }
}
