import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { CloudinaryService } from "../../cloudinary/cloudinary.service";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateClientLogoDTO, UpdateClientLogoDTO } from "./dto/clientLogo.dto";

@injectable()
export class ClientLogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly pagination: PaginationService,
  ) {}

  // === GET ALL (PUBLIC) ===
  async getAllLogos(isActiveOnly: boolean = false) {
    const where = isActiveOnly ? { isActive: true } : {};
    return await this.prisma.clientLogo.findMany({
      where,
      orderBy: { displayOrder: "asc" },
    });
  }

  // === GET ALL (ADMIN) ===
  // Mengambil data untuk tabel admin dengan pagination, search, dan filter
  async getAllLogosAdmin(query: {
    page?: number;
    take?: number;
    search?: string;
    isActive?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      // 1. Logika Search (Name atau AltText)
      if (query.search) {
        where.OR = [
          { name: { contains: query.search } },
          { altText: { contains: query.search } },
        ];
      }

      // 2. Logika Filter isActive
      if (query.isActive && query.isActive !== "ALL") {
        where.isActive = query.isActive === "true";
      }

      // === Total count for pagination ===
      const count = await this.prisma.clientLogo.count({ where });

      // === Query data ===
      const data = await this.prisma.clientLogo.findMany({
        where,
        skip,
        take,
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
      });

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
      console.error("❌ Error in Get All Client Logos Admin:", error);
      throw new Error("Failed to fetch client logos.");
    }
  }

  // === GET BY ID ===
  async getLogoById(id: string) {
    const logo = await this.prisma.clientLogo.findUnique({ where: { id } });
    if (!logo) throw new ApiError("Client logo not found", 404);
    return logo;
  }

  // === CREATE ===
  async createLogo(data: CreateClientLogoDTO, file: Express.Multer.File) {
    if (!file) {
      throw new ApiError("Logo image file is required", 400);
    }

    // 1. Upload ke Cloudinary
    const uploadResult = await this.cloudinary.upload(file, {
      folder: "client-logos",
      resource_type: "image",
    });

    const displayOrderInt = data.displayOrder ? Number(data.displayOrder) : 0;

    const isActiveBool = String(data.isActive) === "true";

    return await this.prisma.clientLogo.create({
      data: {
        name: data.name,
        altText: data.altText,
        websiteUrl: data.websiteUrl,

        displayOrder: displayOrderInt,
        isActive: isActiveBool,

        imageUrl: uploadResult.secure_url,
        imagePublicId: uploadResult.public_id,
      },
    });
  }

  // === UPDATE ===
  async updateLogo(
    id: string,
    data: UpdateClientLogoDTO,
    file?: Express.Multer.File,
  ) {
    const existing = await this.prisma.clientLogo.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Client logo not found", 404);

    let imageUrl = existing.imageUrl;
    let imagePublicId = existing.imagePublicId;

    // 1. Handle Update Image (Jika ada file baru)
    if (file) {
      // Hapus gambar lama jika ada
      if (existing.imageUrl) {
        try {
          await this.cloudinary.remove(existing.imageUrl);
        } catch (error) {
          console.error("Failed to delete old image:", error);
        }
      }

      // Upload gambar baru
      const uploadResult = await this.cloudinary.upload(file, {
        folder: "client-logos",
        resource_type: "image",
      });

      imageUrl = uploadResult.secure_url;
      imagePublicId = uploadResult.public_id;
    }

    // 2. FIX MANUAL: Konversi Tipe Data (Hanya jika field dikirim)
    const displayOrderInt =
      data.displayOrder !== undefined ? Number(data.displayOrder) : undefined;

    const isActiveBool =
      data.isActive !== undefined
        ? String(data.isActive) === "true"
        : undefined;

    // 3. Update Database
    return await this.prisma.clientLogo.update({
      where: { id },
      data: {
        name: data.name,
        altText: data.altText,
        websiteUrl: data.websiteUrl,

        displayOrder: displayOrderInt,
        isActive: isActiveBool,

        imageUrl,
        imagePublicId,
      },
    });
  }

  // === DELETE ===
  async deleteLogo(id: string) {
    const existing = await this.prisma.clientLogo.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Client logo not found", 404);

    // Hapus gambar dari Cloudinary
    if (existing.imageUrl) {
      try {
        await this.cloudinary.remove(existing.imageUrl);
      } catch (error) {
        console.error("Failed to delete image from cloud:", error);
      }
    }

    return await this.prisma.clientLogo.delete({ where: { id } });
  }
}
