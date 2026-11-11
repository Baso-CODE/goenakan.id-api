import {
  Prisma,
  ProductUrlChangeStatus,
  SeoRedirectStatus,
} from "@prisma/client";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { PrismaService } from "../../../prisma/prisma.service";

import { CreateProductUrlRequestDTO } from "./dto/create-product-url-request.dto";
import { ReviewProductUrlRequestDTO } from "./dto/review-product-url-request.dto";

@injectable()
export class ProductUrlApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // VERIFY SUPER ADMIN FROM DATABASE
  // =====================================================

  private async ensureSuperAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!user || user.role.name !== "SUPER_ADMIN") {
      throw new ApiError(
        "Hanya SUPER_ADMIN yang dapat melakukan approval URL produk",
        403,
      );
    }

    return user;
  }

  // =====================================================
  // CREATE URL CHANGE REQUEST
  // =====================================================

  async requestChange(
    productId: string,
    requestedById: string,
    data: CreateProductUrlRequestDTO,
  ) {
    const newSlug = data.newSlug.trim().toLowerCase();

    return this.prisma.$transaction(
      async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        });

        if (!product) {
          throw new ApiError("Produk tidak ditemukan", 404);
        }

        if (product.slug === newSlug) {
          throw new ApiError("URL baru sama dengan URL produk saat ini", 400);
        }

        const existingSlug = await tx.product.findUnique({
          where: { slug: newSlug },
          select: { id: true },
        });

        if (existingSlug) {
          throw new ApiError("Slug sudah digunakan oleh produk lain", 409);
        }

        // Slug bekas yang menjadi redirect tidak boleh
        // digunakan kembali.
        const reservedRedirect = await tx.productUrlRedirect.findUnique({
          where: { oldSlug: newSlug },
          select: { id: true },
        });

        if (reservedRedirect) {
          throw new ApiError(
            "Slug sudah menjadi URL redirect dan tidak dapat digunakan kembali",
            409,
          );
        }

        const pending = await tx.productUrlChangeRequest.findFirst({
          where: {
            productId,
            status: ProductUrlChangeStatus.PENDING,
          },
          select: { id: true },
        });

        if (pending) {
          throw new ApiError(
            "Produk masih memiliki permintaan perubahan URL yang menunggu approval",
            409,
          );
        }

        const request = await tx.productUrlChangeRequest.create({
          data: {
            productId,
            oldSlug: product.slug,
            newSlug,
            reason: data.reason?.trim() || null,
            requestedById,
            status: ProductUrlChangeStatus.PENDING,
          },
        });

        // Cari seluruh Super Admin.
        const superAdmins = await tx.user.findMany({
          where: {
            role: {
              is: {
                name: "SUPER_ADMIN",
              },
            },
          },
          select: { id: true },
        });

        if (superAdmins.length > 0) {
          await tx.adminNotification.createMany({
            data: superAdmins.map((admin) => ({
              userId: admin.id,
              title: "Approval Perubahan URL Produk",
              message:
                `Produk "${product.name}" mengajukan perubahan ` +
                `URL dari "${product.slug}" menjadi "${newSlug}".`,
              type: "PRODUCT_URL_APPROVAL",
              referenceId: request.id,
              actionUrl: `/admin/product-url-approvals/${request.id}`,
            })),
          });
        }

        return {
          message: "Permintaan perubahan URL berhasil dikirim ke Super Admin",
          data: request,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );
  }

  // =====================================================
  // LIST APPROVAL REQUESTS
  // =====================================================

  async getRequests(status?: ProductUrlChangeStatus) {
    return this.prisma.productUrlChangeRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        requestedBy: {
          select: { id: true, name: true },
        },
        reviewedBy: {
          select: { id: true, name: true },
        },
      },
    });
  }

  // =====================================================
  // APPROVE URL CHANGE - SUPER ADMIN ONLY
  // =====================================================

  async approve(
    requestId: string,
    reviewedById: string,
    data: ReviewProductUrlRequestDTO,
  ) {
    await this.ensureSuperAdmin(reviewedById);

    return this.prisma.$transaction(
      async (tx) => {
        const request = await tx.productUrlChangeRequest.findUnique({
          where: { id: requestId },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        });

        if (!request) {
          throw new ApiError("Permintaan approval tidak ditemukan", 404);
        }

        if (request.status !== ProductUrlChangeStatus.PENDING) {
          throw new ApiError("Permintaan sudah diproses", 409);
        }

        // Cegah approval jika slug berubah
        // sejak permintaan dibuat.
        if (request.product.slug !== request.oldSlug) {
          throw new ApiError(
            "Slug produk sudah berubah. Permintaan harus diajukan ulang.",
            409,
          );
        }

        const slugInUse = await tx.product.findUnique({
          where: { slug: request.newSlug },
          select: { id: true },
        });

        if (slugInUse) {
          throw new ApiError("Slug tujuan sudah digunakan produk lain", 409);
        }

        const reservedRedirect = await tx.productUrlRedirect.findUnique({
          where: { oldSlug: request.newSlug },
        });

        if (reservedRedirect) {
          throw new ApiError(
            "Slug tujuan sudah tercatat sebagai URL redirect",
            409,
          );
        }

        // Atomic guard: hanya satu approval
        // dapat memproses request PENDING.
        const claimed = await tx.productUrlChangeRequest.updateMany({
          where: {
            id: requestId,
            status: ProductUrlChangeStatus.PENDING,
          },
          data: {
            status: ProductUrlChangeStatus.APPROVED,
            reviewedById,
            reviewNote: data.reviewNote?.trim() || null,
            reviewedAt: new Date(),
          },
        });

        if (claimed.count !== 1) {
          throw new ApiError(
            "Permintaan sudah diproses oleh pengguna lain",
            409,
          );
        }

        // Cegah perubahan bila slug telah berubah.
        const productUpdated = await tx.product.updateMany({
          where: {
            id: request.productId,
            slug: request.oldSlug,
          },
          data: {
            slug: request.newSlug,
          },
        });

        if (productUpdated.count !== 1) {
          throw new ApiError("Slug produk berubah saat approval diproses", 409);
        }

        // Redirect lama yang sebelumnya menuju
        // slug ini diperbarui supaya langsung menuju
        // URL terbaru, tanpa redirect chain.
        await tx.productUrlRedirect.updateMany({
          where: {
            productId: request.productId,
            newSlug: request.oldSlug,
          },
          data: {
            newSlug: request.newSlug,
            status: SeoRedirectStatus.PENDING,
            verifiedAt: null,
          },
        });

        // Simpan redirect baru.
        await tx.productUrlRedirect.create({
          data: {
            productId: request.productId,
            oldSlug: request.oldSlug,
            newSlug: request.newSlug,
            status: SeoRedirectStatus.PENDING,
          },
        });

        // Notifikasi ke pengaju.
        await tx.adminNotification.create({
          data: {
            userId: request.requestedById,
            title: "Perubahan URL Produk Disetujui",
            message:
              `Perubahan URL produk "${request.product.name}" ` +
              `menjadi "${request.newSlug}" telah disetujui.`,
            type: "PRODUCT_URL_APPROVED",
            referenceId: request.id,
            actionUrl: `/admin/product-url-approvals/${request.id}`,
          },
        });

        // Reminder SEO untuk Super Admin.
        const admins = await tx.user.findMany({
          where: {
            role: {
              is: {
                name: "SUPER_ADMIN",
              },
            },
          },
          select: { id: true },
        });

        if (admins.length > 0) {
          await tx.adminNotification.createMany({
            data: admins.map((admin) => ({
              userId: admin.id,
              title: "SEO Redirect Perlu Diverifikasi",
              message:
                `URL produk "${request.product.name}" berubah. ` +
                `Periksa redirect 301/308, canonical, sitemap, ` +
                `GA4, dan Google Search Console.`,
              type: "PRODUCT_URL_SEO_REMINDER",
              referenceId: request.id,
              actionUrl: "/admin/seo-redirect-tasks",
            })),
          });
        }

        return {
          message: "Perubahan URL produk disetujui",
          data: {
            productId: request.productId,
            oldSlug: request.oldSlug,
            newSlug: request.newSlug,
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 20000,
      },
    );
  }

  // =====================================================
  // REJECT URL CHANGE - SUPER ADMIN ONLY
  // =====================================================

  async reject(
    requestId: string,
    reviewedById: string,
    data: ReviewProductUrlRequestDTO,
  ) {
    await this.ensureSuperAdmin(reviewedById);

    return this.prisma.$transaction(
      async (tx) => {
        const request = await tx.productUrlChangeRequest.findUnique({
          where: { id: requestId },
        });

        if (!request) {
          throw new ApiError("Permintaan tidak ditemukan", 404);
        }

        const updated = await tx.productUrlChangeRequest.updateMany({
          where: {
            id: requestId,
            status: ProductUrlChangeStatus.PENDING,
          },
          data: {
            status: ProductUrlChangeStatus.REJECTED,
            reviewedById,
            reviewNote: data.reviewNote?.trim() || null,
            reviewedAt: new Date(),
          },
        });

        if (updated.count !== 1) {
          throw new ApiError("Permintaan sudah diproses", 409);
        }

        await tx.adminNotification.create({
          data: {
            userId: request.requestedById,
            title: "Perubahan URL Produk Ditolak",
            message:
              data.reviewNote?.trim() ||
              "Super Admin menolak perubahan URL produk.",
            type: "PRODUCT_URL_REJECTED",
            referenceId: requestId,
            actionUrl: `/admin/product-url-approvals/${requestId}`,
          },
        });

        return {
          message: "Permintaan perubahan URL ditolak",
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );
  }
}
