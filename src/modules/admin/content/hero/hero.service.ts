import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { translateWithDeepL } from "../../../../utils/deepl-translate";
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

  // =====================================================
  // HERO SLIDE - SMART DEEPL TRANSLATION
  // =====================================================

  private async resolveHeroTranslation(
    sourceId: string | null | undefined,
    incomingEn: string | null | undefined,
    previousId: string | null | undefined = null,
    previousEn: string | null | undefined = null,
  ): Promise<string | null> {
    const source = sourceId?.trim() || "";
    const oldSource = previousId?.trim() || "";
    const oldEnglish = previousEn?.trim() || "";
    const manualEnglish = incomingEn?.trim() || "";

    const sourceChanged = source !== oldSource;

    // Input EN baru yang berbeda dari data lama
    // dianggap sebagai input manual.
    if (manualEnglish && manualEnglish !== oldEnglish) {
      return manualEnglish;
    }

    // Jika teks ID kosong, jangan translate.
    if (!source) {
      return manualEnglish || null;
    }

    // Tidak perlu translate jika ID tidak berubah
    // dan versi EN sudah tersedia.
    const shouldTranslate =
      sourceChanged ||
      !oldEnglish ||
      (incomingEn !== undefined && !manualEnglish);

    if (!shouldTranslate) {
      return oldEnglish;
    }

    try {
      const translated = await translateWithDeepL(source);

      if (!translated?.trim()) {
        throw new Error("DeepL returned empty translation");
      }

      return translated.trim();
    } catch (error) {
      console.warn("⚠️ DeepL HeroSlide translation failed:", error);

      // Jika teks Indonesia berubah, jangan gunakan
      // terjemahan lama yang sudah tidak sesuai.
      return sourceChanged ? null : oldEnglish || null;
    }
  }

  // === GET ALL ===
  // ====================================================================
  // GET ALL HERO SLIDES - LOCALE SUPPORT
  // ====================================================================
  async getAllSlides(isActiveOnly: boolean = false, locale: string = "id") {
    const where = isActiveOnly ? { isActive: true } : {};

    const slides = await this.prisma.heroSlide.findMany({
      where,
      orderBy: {
        displayOrder: "asc",
      },
    });

    const isEnglish = locale.toLowerCase() === "en";

    return slides.map((slide) => ({
      id: slide.id,

      // ==========================================
      // BILINGUAL CONTENT
      // ==========================================

      title: isEnglish ? slide.titleEn?.trim() || slide.titleId : slide.titleId,

      altText: isEnglish
        ? slide.altTextEn?.trim() || slide.altTextId
        : slide.altTextId,

      ctaText: isEnglish
        ? slide.ctaTextEn?.trim() || slide.ctaTextId
        : slide.ctaTextId,

      // ==========================================
      // UNIVERSAL CONTENT
      // ==========================================

      ctaLink: slide.ctaLink,

      // Images
      imageUrl: slide.imageUrl,
      imagePublicId: slide.imagePublicId,

      imageMobileUrl: slide.imageMobileUrl,
      imageMobilePublicId: slide.imageMobilePublicId,

      imageTabletUrl: slide.imageTabletUrl,
      imageTabletPublicId: slide.imageTabletPublicId,

      // Display settings
      displayOrder: slide.displayOrder,
      isActive: slide.isActive,

      // Timestamp
      createdAt: slide.createdAt,
      updatedAt: slide.updatedAt,
    }));
  }

  // ====================================================================
  // GET ALL HERO SLIDES ADMIN - BILINGUAL SEARCH + PAGINATION
  // ====================================================================
  async getAllSlidesAdmin(query: {
    page?: number;
    take?: number;
    search?: string;
    isActive?: string;
  }) {
    try {
      const page = Math.max(1, Number(query.page) || 1);
      const take = Math.min(100, Math.max(1, Number(query.take) || 10));
      const skip = (page - 1) * take;

      const where: any = {};

      // Search in Indonesian and English fields
      if (query.search?.trim()) {
        const search = query.search.trim();

        where.OR = [
          { titleId: { contains: search } },
          { titleEn: { contains: search } },

          { altTextId: { contains: search } },
          { altTextEn: { contains: search } },

          { ctaTextId: { contains: search } },
          { ctaTextEn: { contains: search } },
        ];
      }

      if (query.isActive !== undefined && query.isActive !== "ALL") {
        where.isActive = query.isActive === "true";
      }

      const [count, data] = await this.prisma.$transaction([
        this.prisma.heroSlide.count({ where }),

        this.prisma.heroSlide.findMany({
          where,
          skip,
          take,
          orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
        }),
      ]);

      const meta = this.pagination.generateMeta({
        count,
        page,
        take,
      });

      return { data, meta };
    } catch (error) {
      console.error("❌ Error in Get All Slides Admin:", error);

      throw new ApiError("Failed to fetch slides.", 500);
    }
  }
  // === GET BY ID ===
  async getSlideById(id: string) {
    const slide = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!slide) throw new ApiError("Hero slide not found", 404);
    return slide;
  }

  // ====================================================================
  // CREATE HERO SLIDE - BILINGUAL DEEPL + CLOUDINARY
  // ====================================================================

  async createSlide(data: CreateHeroSlideDTO, files: HeroSlideFiles) {
    // =====================================================
    // 1. VALIDATION
    // =====================================================

    if (!files?.imageDesktop || !files?.imageMobile) {
      throw new ApiError("Desktop and Mobile images are required", 400);
    }

    const titleId = data.titleId?.trim();

    if (!titleId) {
      throw new ApiError("Judul Hero Slide bahasa Indonesia wajib diisi", 400);
    }

    // =====================================================
    // 2. DEEPL TRANSLATION
    // =====================================================

    const [titleEn, altTextEn, ctaTextEn] = await Promise.all([
      this.resolveHeroTranslation(titleId, data.titleEn),

      this.resolveHeroTranslation(data.altTextId, data.altTextEn),

      this.resolveHeroTranslation(data.ctaTextId, data.ctaTextEn),
    ]);

    // =====================================================
    // 3. CLOUDINARY UPLOAD
    // =====================================================

    const uploadedPublicIds: string[] = [];

    const cleanupUploadedImages = async () => {
      await Promise.allSettled(
        uploadedPublicIds.map(async (publicId) => {
          try {
            await this.cloudinary.delete(publicId);
          } catch (error) {
            console.warn("Failed to cleanup HeroSlide image:", publicId, error);
          }
        }),
      );
    };

    let uploadDesktop: {
      secure_url: string;
      public_id: string;
    };

    let uploadMobile: {
      secure_url: string;
      public_id: string;
    };

    let uploadTablet: {
      secure_url: string;
      public_id: string;
    } | null = null;

    try {
      // Desktop
      uploadDesktop = await this.cloudinary.upload(files.imageDesktop, {
        folder: "hero-slides",
        resource_type: "image",
      });

      uploadedPublicIds.push(uploadDesktop.public_id);

      // Mobile
      uploadMobile = await this.cloudinary.upload(files.imageMobile, {
        folder: "hero-slides",
        resource_type: "image",
      });

      uploadedPublicIds.push(uploadMobile.public_id);

      // Tablet optional
      if (files.imageTablet) {
        uploadTablet = await this.cloudinary.upload(files.imageTablet, {
          folder: "hero-slides",
          resource_type: "image",
        });

        uploadedPublicIds.push(uploadTablet.public_id);
      }
    } catch (error) {
      await cleanupUploadedImages();

      console.error("🔥 HERO SLIDE CLOUDINARY ERROR:", error);

      throw new ApiError(
        "Failed to upload Hero Slide images to Cloudinary",
        500,
      );
    }

    // =====================================================
    // 4. CREATE DATABASE
    // =====================================================

    try {
      const slide = await this.prisma.heroSlide.create({
        data: {
          // Indonesian
          titleId,
          altTextId: data.altTextId?.trim() || null,
          ctaTextId: data.ctaTextId?.trim() || null,

          // English
          titleEn,
          altTextEn,
          ctaTextEn,

          // CTA
          ctaLink: data.ctaLink?.trim() || null,

          // Display
          displayOrder: data.displayOrder ?? 0,
          isActive: data.isActive ?? true,

          // Desktop
          imageUrl: uploadDesktop.secure_url,
          imagePublicId: uploadDesktop.public_id,

          // Mobile
          imageMobileUrl: uploadMobile.secure_url,
          imageMobilePublicId: uploadMobile.public_id,

          // Tablet
          imageTabletUrl: uploadTablet?.secure_url ?? null,
          imageTabletPublicId: uploadTablet?.public_id ?? null,
        },
      });

      return slide;
    } catch (error) {
      await cleanupUploadedImages();

      console.error("🔥 HERO SLIDE DATABASE ERROR:", error);

      throw new ApiError("Failed to create Hero Slide", 500);
    }
  }

  // ====================================================================
  // UPDATE HERO SLIDE - SMART DEEPL + SAFE CLOUDINARY
  // ====================================================================

  async updateSlide(
    id: string,
    data: UpdateHeroSlideDTO,
    files: HeroSlideFiles,
  ) {
    // =====================================================
    // 1. GET EXISTING SLIDE
    // =====================================================

    const existing = await this.prisma.heroSlide.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Hero slide not found", 404);
    }

    // =====================================================
    // 2. PREPARE BILINGUAL CONTENT
    // =====================================================

    const titleId =
      data.titleId !== undefined ? data.titleId.trim() : existing.titleId;

    const altTextId =
      data.altTextId !== undefined
        ? data.altTextId.trim() || null
        : existing.altTextId;

    const ctaTextId =
      data.ctaTextId !== undefined
        ? data.ctaTextId.trim() || null
        : existing.ctaTextId;

    if (!titleId) {
      throw new ApiError("Judul Hero Slide bahasa Indonesia wajib diisi", 400);
    }

    const needsTitleTranslation =
      data.titleId !== undefined || data.titleEn !== undefined;

    const needsAltTranslation =
      data.altTextId !== undefined || data.altTextEn !== undefined;

    const needsCtaTranslation =
      data.ctaTextId !== undefined || data.ctaTextEn !== undefined;

    const [titleEn, altTextEn, ctaTextEn] = await Promise.all([
      needsTitleTranslation
        ? this.resolveHeroTranslation(
            titleId,
            data.titleEn,
            existing.titleId,
            existing.titleEn,
          )
        : Promise.resolve(existing.titleEn),

      needsAltTranslation
        ? this.resolveHeroTranslation(
            altTextId,
            data.altTextEn,
            existing.altTextId,
            existing.altTextEn,
          )
        : Promise.resolve(existing.altTextEn),

      needsCtaTranslation
        ? this.resolveHeroTranslation(
            ctaTextId,
            data.ctaTextEn,
            existing.ctaTextId,
            existing.ctaTextEn,
          )
        : Promise.resolve(existing.ctaTextEn),
    ]);

    // =====================================================
    // 3. PREPARE CURRENT IMAGES
    // =====================================================

    let imageUrl = existing.imageUrl;
    let imagePublicId = existing.imagePublicId;

    let imageMobileUrl = existing.imageMobileUrl;
    let imageMobilePublicId = existing.imageMobilePublicId;

    let imageTabletUrl = existing.imageTabletUrl;
    let imageTabletPublicId = existing.imageTabletPublicId;

    const uploadedPublicIds: string[] = [];
    const oldPublicIdsToDelete: string[] = [];

    const cleanupNewImages = async () => {
      await Promise.allSettled(
        uploadedPublicIds.map(async (publicId) => {
          try {
            await this.cloudinary.delete(publicId);
          } catch (error) {
            console.warn(
              "Failed to cleanup new HeroSlide image:",
              publicId,
              error,
            );
          }
        }),
      );
    };

    // =====================================================
    // 4. UPLOAD NEW IMAGES FIRST
    // =====================================================

    try {
      // Desktop
      if (files?.imageDesktop) {
        const uploaded = await this.cloudinary.upload(files.imageDesktop, {
          folder: "hero-slides",
          resource_type: "image",
        });

        uploadedPublicIds.push(uploaded.public_id);

        imageUrl = uploaded.secure_url;
        imagePublicId = uploaded.public_id;

        if (existing.imagePublicId) {
          oldPublicIdsToDelete.push(existing.imagePublicId);
        }
      }

      // Mobile
      if (files?.imageMobile) {
        const uploaded = await this.cloudinary.upload(files.imageMobile, {
          folder: "hero-slides",
          resource_type: "image",
        });

        uploadedPublicIds.push(uploaded.public_id);

        imageMobileUrl = uploaded.secure_url;
        imageMobilePublicId = uploaded.public_id;

        if (existing.imageMobilePublicId) {
          oldPublicIdsToDelete.push(existing.imageMobilePublicId);
        }
      }

      // Tablet optional
      if (files?.imageTablet) {
        const uploaded = await this.cloudinary.upload(files.imageTablet, {
          folder: "hero-slides",
          resource_type: "image",
        });

        uploadedPublicIds.push(uploaded.public_id);

        imageTabletUrl = uploaded.secure_url;
        imageTabletPublicId = uploaded.public_id;

        if (existing.imageTabletPublicId) {
          oldPublicIdsToDelete.push(existing.imageTabletPublicId);
        }
      }
    } catch (error) {
      await cleanupNewImages();

      console.error("🔥 HERO SLIDE IMAGE UPDATE ERROR:", error);

      throw new ApiError("Failed to update Hero Slide images", 500);
    }

    // =====================================================
    // 5. UPDATE DATABASE
    // =====================================================

    let updatedSlide;

    try {
      updatedSlide = await this.prisma.heroSlide.update({
        where: { id },

        data: {
          // Indonesian
          titleId,
          altTextId,
          ctaTextId,

          // English
          titleEn,
          altTextEn,
          ctaTextEn,

          // CTA
          ...(data.ctaLink !== undefined && {
            ctaLink: data.ctaLink.trim() || null,
          }),

          // Display
          ...(data.displayOrder !== undefined && {
            displayOrder: data.displayOrder,
          }),

          ...(data.isActive !== undefined && {
            isActive: data.isActive,
          }),

          // Desktop
          imageUrl,
          imagePublicId,

          // Mobile
          imageMobileUrl,
          imageMobilePublicId,

          // Tablet
          imageTabletUrl,
          imageTabletPublicId,
        },
      });
    } catch (error) {
      await cleanupNewImages();

      console.error("🔥 HERO SLIDE DATABASE UPDATE ERROR:", error);

      throw new ApiError("Failed to update Hero Slide", 500);
    }

    // =====================================================
    // 6. DELETE OLD IMAGES AFTER DATABASE SUCCESS
    // =====================================================

    const currentPublicIds = new Set(
      [imagePublicId, imageMobilePublicId, imageTabletPublicId].filter(
        (publicId): publicId is string => Boolean(publicId),
      ),
    );

    const unusedOldPublicIds = [...new Set(oldPublicIdsToDelete)].filter(
      (publicId) => !currentPublicIds.has(publicId),
    );

    await Promise.allSettled(
      unusedOldPublicIds.map(async (publicId) => {
        try {
          await this.cloudinary.delete(publicId);
        } catch (error) {
          console.warn(
            "⚠️ Failed to remove old HeroSlide image:",
            publicId,
            error,
          );
        }
      }),
    );

    // =====================================================
    // 7. RETURN UPDATED SLIDE
    // =====================================================

    return updatedSlide;
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
