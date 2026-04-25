import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { CloudinaryService } from "../../../cloudinary/cloudinary.service";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreatePortfolioDTO } from "./dto/createPorfolio.dto";
import { UpdatePortfolioDTO } from "./dto/updatePorfolio.dto";

@injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly slug: SlugService,
    private readonly pagination: PaginationService,
  ) {}

  // ====================================================================
  // 1. GET ALL FOR ADMIN (With Pagination & Search)
  // ====================================================================
  async getAllPortfolios(query: {
    page?: number;
    take?: number;
    search?: string;
  }) {
    const where: any = {};
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { clientName: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const count = await this.prisma.portfolio.count({ where });
    const data = await this.prisma.portfolio.findMany({
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
  async getPortfolioById(id: string) {
    const portfolio = await this.prisma.portfolio.findUnique({ where: { id } });
    if (!portfolio) throw new ApiError("Portfolio not found", 404);
    return portfolio;
  }

  // ====================================================================
  // 3. CREATE PORTFOLIO
  // ====================================================================
  async createPortfolio(data: CreatePortfolioDTO, file: Express.Multer.File) {
    if (!file) throw new ApiError("Portfolio image is required", 400);

    const slug = this.slug.create(data.title);
    let uploadResult;

    // --- UPLOAD KE CLOUDINARY ---
    try {
      uploadResult = await this.cloudinary.upload(file, {
        folder: "portfolios",
      });
    } catch (error: any) {
      console.error("🔥 CLOUDINARY UPLOAD ERROR:", error);
      throw new ApiError(`Gagal upload gambar: ${error.message}`, 500);
    }

    // --- INSERT KE DATABASE ---
    try {
      const newPortfolio = await this.prisma.portfolio.create({
        data: {
          title: data.title,
          slug,
          clientName: data.clientName,
          description: data.description,
          image: uploadResult.secure_url,
          imageId: uploadResult.public_id,
          displayOrder: Number(data.displayOrder || 0),
          // Parsing string dari FormData ke boolean
          isActive: data.isActive ? String(data.isActive) === "true" : true,
        },
      });

      return newPortfolio;
    } catch (error: any) {
      // ⚠️ ROLLBACK: Jika DB gagal, hapus gambar yang baru saja diupload ke Cloudinary
      if (uploadResult?.public_id) {
        await this.cloudinary.delete(uploadResult.public_id).catch(() => null);
      }

      console.error("🔥 DATABASE INSERT ERROR:", error);

      if (error.code === "P2002") {
        throw new ApiError(
          `Judul portfolio "${data.title}" sudah digunakan (Slug duplikat).`,
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
  // 4. UPDATE PORTFOLIO
  // ====================================================================
  async updatePortfolio(
    id: string,
    data: UpdatePortfolioDTO,
    file?: Express.Multer.File,
  ) {
    const existing = await this.getPortfolioById(id);

    let imageUrl = existing.image;
    let imageId = existing.imageId;

    // --- JIKA ADA FILE BARU ---
    if (file) {
      try {
        // 1. Hapus file lama di Cloudinary agar tidak menumpuk
        if (existing.imageId) {
          await this.cloudinary.delete(existing.imageId).catch(() => null);
        }

        // 2. Upload file baru
        const uploadResult = await this.cloudinary.upload(file, {
          folder: "portfolios",
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

      const updatedPortfolio = await this.prisma.portfolio.update({
        where: { id },
        data: {
          title: data.title,
          slug,
          clientName: data.clientName,
          description: data.description,
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

      return updatedPortfolio;
    } catch (error: any) {
      console.error("🔥 DATABASE UPDATE ERROR:", error);

      if (error.code === "P2002") {
        throw new ApiError("Judul portfolio tersebut sudah digunakan.", 400);
      }

      throw new ApiError(
        "Terjadi kesalahan saat memperbarui data di database.",
        500,
      );
    }
  }

  // ====================================================================
  // 5. DELETE PORTFOLIO
  // ====================================================================
  async deletePortfolio(id: string) {
    const existing = await this.getPortfolioById(id);

    try {
      // 1. Hapus gambar dari Cloudinary terlebih dahulu
      if (existing.imageId) {
        await this.cloudinary.delete(existing.imageId);
      }

      // 2. Hapus data dari Database
      return await this.prisma.portfolio.delete({ where: { id } });
    } catch (error: any) {
      console.error("🔥 DELETE ERROR:", error);
      throw new ApiError("Gagal menghapus portfolio dari sistem.", 500);
    }
  }

  // ====================================================================
  // 6. GET PUBLIC PORTFOLIOS (Untuk Landing Page)
  // ====================================================================
  async getPublicPortfolios() {
    try {
      return await this.prisma.portfolio.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          title: true,
          clientName: true,
          image: true,
          slug: true,
        },
      });
    } catch (error) {
      throw new ApiError("Gagal mengambil data portfolio publik.", 500);
    }
  }
}
