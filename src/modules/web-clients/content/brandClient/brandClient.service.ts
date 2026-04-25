import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { CloudinaryService } from "../../../cloudinary/cloudinary.service";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateBrandClientDTO } from "./dto/createBrandClient.dto";
import { UpdateBrandClientDTO } from "./dto/updateBrandClient.dto";

@injectable()
export class BrandClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly slug: SlugService,
    private readonly pagination: PaginationService,
  ) {}

  // === GET ALL (WITH PAGINATION & SEARCH) ===
  async getAllBrandClients(query: {
    page?: number;
    take?: number;
    search?: string;
  }) {
    const where: any = {};
    if (query.search) {
      where.name = { contains: query.search, mode: "insensitive" };
    }

    const count = await this.prisma.brandClient.count({ where });
    const data = await this.prisma.brandClient.findMany({
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

  // === GET BY ID ===
  async getBrandClientById(id: string) {
    const client = await this.prisma.brandClient.findUnique({ where: { id } });
    if (!client) throw new ApiError("Brand Client not found", 404);
    return client;
  }

  async createBrandClient(
    data: CreateBrandClientDTO,
    file: Express.Multer.File,
  ) {
    // 1. Validasi File awal
    if (!file) throw new ApiError("Logo file is required", 400);

    const slug = this.slug.create(data.name);

    let uploadResult;

    // 2. Try-Catch untuk Cloudinary
    try {
      uploadResult = await this.cloudinary.upload(file, {
        folder: "clients/logos",
      });
    } catch (error: any) {
      console.error("🔥 CLOUDINARY ERROR:", error);
      throw new ApiError(`Gagal upload ke Cloudinary: ${error.message}`, 500);
    }

    // 3. Try-Catch untuk Prisma Database
    try {
      const newClient = await this.prisma.brandClient.create({
        data: {
          name: data.name,
          slug,
          country: data.country,
          websiteUrl: data.websiteUrl,
          logo: uploadResult.secure_url,
          logoId: uploadResult.public_id,
          displayOrder: Number(data.displayOrder || 0),
        },
      });

      return newClient;
    } catch (error: any) {
      if (uploadResult?.public_id) {
        await this.cloudinary.delete(uploadResult.public_id).catch(() => null);
      }

      console.error("🔥 DATABASE ERROR:", error);

      if (error.code === "P2002") {
        throw new ApiError(
          `Client dengan nama "${data.name}" sudah ada (Slug duplikat).`,
          400,
        );
      }

      throw new ApiError(
        `Gagal menyimpan data ke Database: ${error.message}`,
        500,
      );
    }
  }
  // === UPDATE CLIENT ===
  async updateBrandClient(
    id: string,
    data: UpdateBrandClientDTO,
    file?: Express.Multer.File,
  ) {
    const existing = await this.getBrandClientById(id);

    let logoUrl = existing.logo;
    let logoId = existing.logoId;

    // Jika ada file baru, hapus yang lama dan upload yang baru
    if (file) {
      if (existing.logoId) {
        await this.cloudinary.delete(existing.logoId).catch(() => null);
      }
      const uploadResult = await this.cloudinary.upload(file, {
        folder: "brand-clients",
      });
      logoUrl = uploadResult.secure_url;
      logoId = uploadResult.public_id;
    }

    const slug = data.name ? this.slug.create(data.name) : existing.slug;

    return await this.prisma.brandClient.update({
      where: { id },
      data: {
        ...data,
        slug,
        logo: logoUrl,
        logoId: logoId,
        displayOrder: data.displayOrder
          ? Number(data.displayOrder)
          : existing.displayOrder,
      },
    });
  }

  // === DELETE CLIENT ===
  async deleteBrandClient(id: string) {
    const existing = await this.getBrandClientById(id);

    // Hapus file di Cloudinary
    if (existing.logoId) {
      await this.cloudinary.delete(existing.logoId).catch(() => null);
    }

    return await this.prisma.brandClient.delete({ where: { id } });
  }
  async getPublicClients() {
    return await this.prisma.brandClient.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        name: true,
        country: true,
        logo: true,
        websiteUrl: true,
      },
    });
  }
}
