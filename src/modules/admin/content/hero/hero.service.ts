import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { CloudinaryService } from "../../../cloudinary/cloudinary.service";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateHeroSlideDTO, UpdateHeroSlideDTO } from "./dto/hero.dto";

// Interface baru untuk mengelompokkan file yang diupload
export interface HeroSlideFiles {
  imageDesktop?: Express.Multer.File;
  imageMobile?: Express.Multer.File;
  imageTablet?: Express.Multer.File;
}

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

      if (query.search) {
        where.OR = [
          { title: { contains: query.search } },
          { altText: { contains: query.search } },
          { ctaText: { contains: query.search } },
        ];
      }

      if (query.isActive && query.isActive !== "ALL") {
        where.isActive = query.isActive === "true";
      }

      const count = await this.prisma.heroSlide.count({ where });

      const data = await this.prisma.heroSlide.findMany({
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

      return { data, meta };
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
  async createSlide(data: CreateHeroSlideDTO, files: HeroSlideFiles) {
    // Validasi file wajib di Service
    if (!files.imageDesktop || !files.imageMobile) {
      throw new ApiError("Desktop and Mobile images are required", 400);
    }

    // Upload Desktop
    const uploadDesktop = await this.cloudinary.upload(files.imageDesktop, {
      folder: "hero-slides",
      resource_type: "image",
    });

    // Upload Mobile
    const uploadMobile = await this.cloudinary.upload(files.imageMobile, {
      folder: "hero-slides",
      resource_type: "image",
    });

    // Upload Tablet (Opsional)
    let uploadTablet: any = null;
    if (files.imageTablet) {
      uploadTablet = await this.cloudinary.upload(files.imageTablet, {
        folder: "hero-slides",
        resource_type: "image",
      });
    }

    const displayOrderInt = data.displayOrder ? Number(data.displayOrder) : 0;
    const isActiveBool = String(data.isActive) === "true";

    // Simpan ke Database
    return await this.prisma.heroSlide.create({
      data: {
        title: data.title,
        altText: data.altText,
        ctaText: data.ctaText,
        ctaLink: data.ctaLink,
        displayOrder: displayOrderInt,
        isActive: isActiveBool,
        // Mapping untuk Desktop
        imageUrl: uploadDesktop.secure_url,
        imagePublicId: uploadDesktop.public_id,
        // Mapping untuk Mobile
        imageMobileUrl: uploadMobile.secure_url,
        imageMobilePublicId: uploadMobile.public_id,
        // Mapping untuk Tablet
        imageTabletUrl: uploadTablet ? uploadTablet.secure_url : null,
        imageTabletPublicId: uploadTablet ? uploadTablet.public_id : null,
      },
    });
  }

  // === UPDATE ===
  async updateSlide(
    id: string,
    data: UpdateHeroSlideDTO,
    files: HeroSlideFiles,
  ) {
    const existing = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Hero slide not found", 404);

    let {
      imageUrl,
      imagePublicId,
      imageMobileUrl,
      imageMobilePublicId,
      imageTabletUrl,
      imageTabletPublicId,
    } = existing;

    // Helper untuk hapus gambar lama dari Cloudinary
    const safeRemoveCloudinary = async (url: string | null) => {
      if (url) {
        try {
          await this.cloudinary.remove(url);
        } catch (err) {
          console.error("Failed to delete old image:", err);
        }
      }
    };

    // Update Desktop Image
    if (files.imageDesktop) {
      await safeRemoveCloudinary(existing.imageUrl);
      const res = await this.cloudinary.upload(files.imageDesktop, {
        folder: "hero-slides",
      });
      imageUrl = res.secure_url;
      imagePublicId = res.public_id;
    }

    // Update Mobile Image
    if (files.imageMobile) {
      await safeRemoveCloudinary(existing.imageMobileUrl);
      const res = await this.cloudinary.upload(files.imageMobile, {
        folder: "hero-slides",
      });
      imageMobileUrl = res.secure_url;
      imageMobilePublicId = res.public_id;
    }

    // Update Tablet Image
    if (files.imageTablet) {
      await safeRemoveCloudinary(existing.imageTabletUrl);
      const res = await this.cloudinary.upload(files.imageTablet, {
        folder: "hero-slides",
      });
      imageTabletUrl = res.secure_url;
      imageTabletPublicId = res.public_id;
    }

    const displayOrderInt =
      data.displayOrder !== undefined ? Number(data.displayOrder) : undefined;
    const isActiveBool =
      data.isActive !== undefined
        ? String(data.isActive) === "true"
        : undefined;

    return await this.prisma.heroSlide.update({
      where: { id },
      data: {
        title: data.title,
        altText: data.altText,
        ctaText: data.ctaText,
        ctaLink: data.ctaLink,
        displayOrder: displayOrderInt,
        isActive: isActiveBool,

        imageUrl,
        imagePublicId,
        imageMobileUrl,
        imageMobilePublicId,
        imageTabletUrl,
        imageTabletPublicId,
      },
    });
  }

  // === DELETE ===
  async deleteSlide(id: string) {
    const existing = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Hero slide not found", 404);

    const safeRemoveCloudinary = async (url: string | null) => {
      if (url) {
        try {
          await this.cloudinary.remove(url);
        } catch (err) {
          console.error("Failed to delete image from cloud:", err);
        }
      }
    };

    // Hapus semua gambar dari Cloudinary jika ada
    await safeRemoveCloudinary(existing.imageUrl);
    await safeRemoveCloudinary(existing.imageMobileUrl);
    await safeRemoveCloudinary(existing.imageTabletUrl);

    return await this.prisma.heroSlide.delete({ where: { id } });
  }
}
