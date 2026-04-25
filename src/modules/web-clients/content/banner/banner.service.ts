import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { CloudinaryService } from "../../../cloudinary/cloudinary.service";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreatePopupBannerDTO, UpdatePopupBannerDTO } from "./dto/banner.dto";

// Tipe helper untuk Multiple Files dari Multer
interface PopupBannerFiles {
  desktopImage?: Express.Multer.File[];
  mobileImage?: Express.Multer.File[];
}

@injectable()
export class PopupBannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly pagination: PaginationService,
  ) {}

  // === GET ALL (PUBLIC) ===
  // Mengambil banner aktif yang sesuai jadwal tanggal (jika diset)
  async getActiveBanner() {
    const now = new Date();

    return await this.prisma.popupBanner.findFirst({
      where: {
        isActive: true,
        AND: [
          // Logic: (StartDate IS NULL OR StartDate <= Now) AND (EndDate IS NULL OR EndDate >= Now)
          {
            OR: [{ startDate: null }, { startDate: { lte: now } }],
          },
          {
            OR: [{ endDate: null }, { endDate: { gte: now } }],
          },
        ],
      },
      orderBy: { createdAt: "desc" }, // Ambil yang paling baru dibuat
    });
  }

  // === GET ALL (ADMIN) ===
  async getAllBannersAdmin(query: {
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

      // 1. Logika Search (Title atau AltText)
      if (query.search) {
        where.OR = [
          { title: { contains: query.search } },
          { altText: { contains: query.search } },
        ];
      }

      // 2. Logika Filter isActive
      if (query.isActive && query.isActive !== "ALL") {
        where.isActive = query.isActive === "true";
      }

      // === Total count ===
      const count = await this.prisma.popupBanner.count({ where });

      // === Query data ===
      const data = await this.prisma.popupBanner.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      });

      // === Meta ===
      const meta = this.pagination.generateMeta({
        count,
        page,
        take,
      });

      return { data, meta };
    } catch (error) {
      console.error("❌ Error in Get All Banners Admin:", error);
      throw new Error("Failed to fetch banners.");
    }
  }

  // === GET BY ID ===
  async getBannerById(id: string) {
    const banner = await this.prisma.popupBanner.findUnique({ where: { id } });
    if (!banner) throw new ApiError("Popup banner not found", 404);
    return banner;
  }

  // === CREATE ===
  async createBanner(data: CreatePopupBannerDTO, files: PopupBannerFiles) {
    // 1. Validasi File (Wajib ada keduanya saat Create)
    const desktopFile = files.desktopImage?.[0];
    const mobileFile = files.mobileImage?.[0];

    if (!desktopFile || !mobileFile) {
      throw new ApiError("Both Desktop and Mobile images are required", 400);
    }

    // 2. Upload ke Cloudinary (Parallel Upload biar cepat)
    const [desktopUpload, mobileUpload] = await Promise.all([
      this.cloudinary.upload(desktopFile, {
        folder: "popup-banners/desktop",
        resource_type: "image",
      }),
      this.cloudinary.upload(mobileFile, {
        folder: "popup-banners/mobile",
        resource_type: "image",
      }),
    ]);

    // 3. Konversi Data (FormData safety)
    const isActiveBool = String(data.isActive) === "true";

    // Konversi Date (jika string kosong/undefined, jadi null)
    const startDateVal = data.startDate ? new Date(data.startDate) : null;
    const endDateVal = data.endDate ? new Date(data.endDate) : null;

    // 4. Simpan ke DB
    return await this.prisma.popupBanner.create({
      data: {
        title: data.title,
        altText: data.altText,
        linkUrl: data.linkUrl,

        isActive: isActiveBool,
        startDate: startDateVal,
        endDate: endDateVal,

        // Desktop Image
        desktopImageUrl: desktopUpload.secure_url,
        desktopImagePublicId: desktopUpload.public_id,

        // Mobile Image
        mobileImageUrl: mobileUpload.secure_url,
        mobileImagePublicId: mobileUpload.public_id,
      },
    });
  }

  // === UPDATE ===
  async updateBanner(
    id: string,
    data: UpdatePopupBannerDTO,
    files: PopupBannerFiles,
  ) {
    const existing = await this.prisma.popupBanner.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Popup banner not found", 404);

    let {
      desktopImageUrl,
      desktopImagePublicId,
      mobileImageUrl,
      mobileImagePublicId,
    } = existing;

    const desktopFile = files.desktopImage?.[0];
    const mobileFile = files.mobileImage?.[0];

    // 1. Handle Update Desktop Image
    if (desktopFile) {
      if (existing.desktopImageUrl) {
        await this.cloudinary
          .remove(existing.desktopImageUrl)
          .catch(console.error);
      }
      const upload = await this.cloudinary.upload(desktopFile, {
        folder: "popup-banners/desktop",
        resource_type: "image",
      });
      desktopImageUrl = upload.secure_url;
      desktopImagePublicId = upload.public_id;
    }

    // 2. Handle Update Mobile Image
    if (mobileFile) {
      if (existing.mobileImageUrl) {
        await this.cloudinary
          .remove(existing.mobileImageUrl)
          .catch(console.error);
      }
      const upload = await this.cloudinary.upload(mobileFile, {
        folder: "popup-banners/mobile",
        resource_type: "image",
      });
      mobileImageUrl = upload.secure_url;
      mobileImagePublicId = upload.public_id;
    }

    // 3. Konversi Data (FormData safety)
    const isActiveBool =
      data.isActive !== undefined
        ? String(data.isActive) === "true"
        : undefined;

    const startDateVal = data.startDate ? new Date(data.startDate) : undefined;
    const endDateVal = data.endDate ? new Date(data.endDate) : undefined;

    // 4. Update DB
    return await this.prisma.popupBanner.update({
      where: { id },
      data: {
        title: data.title,
        altText: data.altText,
        linkUrl: data.linkUrl,

        isActive: isActiveBool,
        startDate: startDateVal,
        endDate: endDateVal,

        desktopImageUrl,
        desktopImagePublicId,
        mobileImageUrl,
        mobileImagePublicId,
      },
    });
  }

  // === DELETE ===
  async deleteBanner(id: string) {
    const existing = await this.prisma.popupBanner.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Popup banner not found", 404);

    // Hapus kedua gambar dari Cloudinary
    const deletePromises = [];
    if (existing.desktopImageUrl) {
      deletePromises.push(this.cloudinary.remove(existing.desktopImageUrl));
    }
    if (existing.mobileImageUrl) {
      deletePromises.push(this.cloudinary.remove(existing.mobileImageUrl));
    }

    // Jalankan penghapusan gambar (ignore error jika gagal delete di cloud)
    await Promise.allSettled(deletePromises);

    return await this.prisma.popupBanner.delete({ where: { id } });
  }
}
