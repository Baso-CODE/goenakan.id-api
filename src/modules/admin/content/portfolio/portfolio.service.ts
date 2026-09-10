import { translate } from "@vitalets/google-translate-api";
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
        { title_id: { contains: query.search, mode: "insensitive" } },
        { title_en: { contains: query.search, mode: "insensitive" } },
        { clientName: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const count = await this.prisma.portfolio.count({ where });
    const data = await this.prisma.portfolio.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { displayOrder: "asc" },
      include: {
        eventCategory: {
          select: {
            id: true,
            title_id: true,
            title_en: true,
          },
        },
      },
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
  // 3. CREATE PORTFOLIO (Dengan Auto-Translate jika EN kosong)
  // ====================================================================
  async createPortfolio(data: CreatePortfolioDTO, file: Express.Multer.File) {
    if (!file) throw new ApiError("Portfolio image is required", 400);

    const slug = this.slug.create(data.title_id);
    let uploadResult;

    // --- 1. PROSES AUTO-TRANSLATE JIKA TITLE_EN / DESCRIPTION_EN KOSONG ---
    let finalTitleEn = data.title_en;
    let finalDescEn = data.description_en;

    try {
      // Jika title_en tidak diisi, terjemahkan title_id ke bahasa Inggris (en)
      if (!finalTitleEn && data.title_id) {
        const resTitle = await translate(data.title_id, { to: "en" });
        finalTitleEn = resTitle.text;
      }

      // Jika description_en tidak diisi tapi deskripsi ID ada, terjemahkan ke bahasa Inggris (en)
      if (!finalDescEn && data.description) {
        const resDesc = await translate(data.description, { to: "en" });
        finalDescEn = resDesc.text;
      }
    } catch (transError) {
      console.warn(
        "⚠️ Warning: Auto-translate gagal, menggunakan nilai kosong:",
        transError,
      );
    }

    // --- 2. UPLOAD KE CLOUDINARY ---
    try {
      uploadResult = await this.cloudinary.upload(file, {
        folder: "portfolios",
      });
    } catch (error: any) {
      console.error("🔥 CLOUDINARY UPLOAD ERROR:", error);
      throw new ApiError(`Gagal upload gambar: ${error.message}`, 500);
    }

    // --- 3. INSERT KE DATABASE ---
    try {
      const newPortfolio = await this.prisma.portfolio.create({
        data: {
          title_id: data.title_id,
          title_en: finalTitleEn || null, // Menggunakan hasil terjemahan otomatis atau input manual
          slug,
          clientName: data.clientName,
          description: data.description || null,
          description_en: finalDescEn || null, // Menggunakan hasil terjemahan otomatis atau input manual
          image: uploadResult.secure_url,
          imageId: uploadResult.public_id,
          displayOrder: Number(data.displayOrder || 0),
          isActive: data.isActive ? String(data.isActive) === "true" : true,
          orderQuantity:
            data.orderQuantity !== undefined ? Number(data.orderQuantity) : 0,
          projectDate: data.projectDate ? new Date(data.projectDate) : null,
          eventCategoryId: data.eventCategoryId || null,
        },
      });

      return newPortfolio;
    } catch (error: any) {
      if (uploadResult?.public_id) {
        await this.cloudinary.delete(uploadResult.public_id).catch(() => null);
      }

      console.error("🔥 DATABASE INSERT ERROR:", error);

      if (error.code === "P2002") {
        throw new ApiError(
          `Judul portfolio "${data.title_id}" sudah digunakan (Slug duplikat).`,
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
  // 4. UPDATE PORTFOLIO (Dengan Smart Auto-Translate untuk Title & Description)
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
        if (existing.imageId) {
          await this.cloudinary.delete(existing.imageId).catch(() => null);
        }

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

    // --- PROSES SMART AUTO-TRANSLATE UNTUK UPDATE ---
    let finalTitleEn = data.title_en;
    let finalDescEn = data.description_en;

    try {
      // 1. Logika untuk Title (Judul)
      const activeTitleId =
        data.title_id !== undefined ? data.title_id : existing.title_id;

      const titleIdChanged =
        data.title_id !== undefined && data.title_id !== existing.title_id;

      const shouldTranslateTitle =
        !finalTitleEn ||
        (titleIdChanged &&
          (finalTitleEn === existing.title_en || !finalTitleEn));

      if (shouldTranslateTitle && activeTitleId) {
        const resTitle = await translate(activeTitleId, { to: "en" });
        finalTitleEn = resTitle.text;
      }

      // 2. Logika untuk Description (Deskripsi)
      const activeDesc =
        data.description !== undefined
          ? data.description
          : existing.description;

      const descChanged =
        data.description !== undefined &&
        data.description !== existing.description;

      const shouldTranslateDesc =
        (!finalDescEn && activeDesc) ||
        (descChanged &&
          activeDesc &&
          (finalDescEn === existing.description_en || !finalDescEn));

      if (shouldTranslateDesc && activeDesc) {
        const resDesc = await translate(activeDesc, { to: "en" });
        finalDescEn = resDesc.text;
      }
    } catch (transError) {
      console.warn(
        "⚠️ Warning: Auto-translate saat update portfolio gagal:",
        transError,
      );
    }

    // --- UPDATE DATABASE ---
    try {
      const slug =
        data.title_id && data.title_id !== existing.title_id
          ? this.slug.create(data.title_id)
          : existing.slug;

      const updatedPortfolio = await this.prisma.portfolio.update({
        where: { id },
        data: {
          title_id:
            data.title_id !== undefined ? data.title_id : existing.title_id,
          title_en:
            finalTitleEn !== undefined ? finalTitleEn : existing.title_en,
          slug,
          clientName:
            data.clientName !== undefined
              ? data.clientName
              : existing.clientName,
          description:
            data.description !== undefined
              ? data.description
              : existing.description,
          description_en:
            finalDescEn !== undefined ? finalDescEn : existing.description_en,
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
          orderQuantity:
            data.orderQuantity !== undefined
              ? Number(data.orderQuantity)
              : existing.orderQuantity,
          projectDate: data.projectDate
            ? new Date(data.projectDate)
            : existing.projectDate,
          eventCategoryId:
            data.eventCategoryId !== undefined
              ? data.eventCategoryId || null
              : existing.eventCategoryId,
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
      if (existing.imageId) {
        await this.cloudinary.delete(existing.imageId);
      }

      return await this.prisma.portfolio.delete({ where: { id } });
    } catch (error: any) {
      console.error("🔥 DELETE ERROR:", error);
      throw new ApiError("Gagal menghapus portfolio dari sistem.", 500);
    }
  }

  // ====================================================================
  // 6. GET PUBLIC PORTFOLIOS (Dengan dukungan parameter lang)
  // ====================================================================
  async getPublicPortfolios(lang: string = "id") {
    try {
      const portfolios = await this.prisma.portfolio.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          title_id: true,
          title_en: true,
          clientName: true,
          image: true,
          slug: true,
          description: true,
          description_en: true,
        },
      });

      // Mapping hasil data agar properti 'title' dan 'description' menyesuaikan bahasa
      return portfolios.map((item) => ({
        id: item.id,
        title: lang === "en" && item.title_en ? item.title_en : item.title_id,
        description:
          lang === "en" && item.description_en
            ? item.description_en
            : item.description,
        clientName: item.clientName,
        image: item.image,
        slug: item.slug,
      }));
    } catch (error) {
      throw new ApiError("Gagal mengambil data portfolio publik.", 500);
    }
  }
}
