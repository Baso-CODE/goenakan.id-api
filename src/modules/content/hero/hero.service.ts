import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { CloudinaryService } from "../../cloudinary/cloudinary.service";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateHeroSlideDTO, UpdateHeroSlideDTO } from "./dto/hero.dto";

@injectable()
export class HeroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly pagination: PaginationService,
  ) {}

  // === GET ALL ===
  async getAllSlides(isActiveOnly: boolean = false) {
    const where = isActiveOnly ? { isActive: true } : {};
    return await this.prisma.heroSlide.findMany({
      where,
      orderBy: { displayOrder: "asc" },
    });
  }

  async getAllSlidesAdmin(query: {
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

      // 1. Logika Search (Title, AltText, atau CTA)
      if (query.search) {
        where.OR = [
          { title: { contains: query.search } },
          { altText: { contains: query.search } },
          { ctaText: { contains: query.search } },
        ];
      }

      // 2. Logika Filter isActive
      if (query.isActive && query.isActive !== "ALL") {
        where.isActive = query.isActive === "true";
      }

      // === Total count for pagination ===
      const count = await this.prisma.heroSlide.count({ where });

      // === Query data ===
      const data = await this.prisma.heroSlide.findMany({
        where,
        skip,
        take,
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
      });

      // === Generate pagination meta ===
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
      console.error("❌ Error in Get All Slides Admin:", error);
      throw new Error("Failed to fetch slides.");
    }
  }

  // === GET BY ID ===
  async getSlideById(id: string) {
    const slide = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!slide) throw new ApiError("Hero slide not found", 404);
    return slide;
  }

  // === CREATE ===
  // ... imports

  // === CREATE ===
  async createSlide(data: CreateHeroSlideDTO, file: Express.Multer.File) {
    if (!file) {
      throw new ApiError("Image file is required", 400);
    }

    const uploadResult = await this.cloudinary.upload(file, {
      folder: "hero-slides",
      resource_type: "image",
    });

    const displayOrderInt = data.displayOrder ? Number(data.displayOrder) : 0;

    const isActiveBool = String(data.isActive) === "true";

    // 2. Simpan ke Database
    return await this.prisma.heroSlide.create({
      data: {
        title: data.title,
        altText: data.altText,
        ctaText: data.ctaText,
        ctaLink: data.ctaLink,

        // Gunakan variabel yang sudah dikonversi
        displayOrder: displayOrderInt,
        isActive: isActiveBool,

        imageUrl: uploadResult.secure_url,
        imagePublicId: uploadResult.public_id,
      },
    });
  }

  // === UPDATE ===
  async updateSlide(
    id: string,
    data: UpdateHeroSlideDTO,
    file?: Express.Multer.File,
  ) {
    const existing = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Hero slide not found", 404);

    let imageUrl = existing.imageUrl;
    let imagePublicId = existing.imagePublicId;

    if (file) {
      if (existing.imageUrl) {
        try {
          await this.cloudinary.remove(existing.imageUrl);
        } catch (error) {
          console.error("Failed to delete old image:", error);
        }
      }

      const uploadResult = await this.cloudinary.upload(file, {
        folder: "hero-slides",
        resource_type: "image",
      });

      imageUrl = uploadResult.secure_url;
      imagePublicId = uploadResult.public_id;
    }

    // ✅ FIX MANUAL JUGA UNTUK UPDATE (PENTING)
    const displayOrderInt =
      data.displayOrder !== undefined ? Number(data.displayOrder) : undefined;
    const isActiveBool =
      data.isActive !== undefined
        ? String(data.isActive) === "true"
        : undefined;

    // 3. Update Database
    return await this.prisma.heroSlide.update({
      where: { id },
      data: {
        title: data.title,
        altText: data.altText,
        ctaText: data.ctaText,
        ctaLink: data.ctaLink,

        // Gunakan yang sudah dikonversi
        displayOrder: displayOrderInt,
        isActive: isActiveBool,

        imageUrl,
        imagePublicId,
      },
    });
  }
  // === DELETE ===
  async deleteSlide(id: string) {
    const existing = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Hero slide not found", 404);

    if (existing.imageUrl) {
      try {
        await this.cloudinary.remove(existing.imageUrl);
      } catch (error) {
        console.error("Failed to delete image from cloud:", error);
      }
    }

    return await this.prisma.heroSlide.delete({ where: { id } });
  }
}
