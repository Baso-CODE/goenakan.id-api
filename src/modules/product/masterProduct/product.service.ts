import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { SlugService } from "../../../utils/genereateSlug";
import { CloudinaryService } from "../../cloudinary/cloudinary.service";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateProductDTO } from "./dto/createProduct.dto";
import { ProductSeoDTO } from "./dto/productSEO.dto";
import { UpdateProductAttributesDTO } from "./dto/updateAttributes.dto";
import { UpdateProductCoreDTO } from "./dto/updateProduct.dto";
import { UpdateProductImageDTO } from "./dto/updateProductImage.dto";
import { UpdateProductVideoDTO } from "./dto/updateProductVideo.dto";
import {
  UpdateProductVariantFiles,
  UpdateProductVariantsDTO,
} from "./dto/updateVariantsProduct.dto";

export interface ProductExportQuery {
  startDate?: string;
  endDate?: string;
  search?: string;
  categoryId?: string;
  isCustom?: "true" | "false" | "ALL";
}
// Tipe untuk file upload (menggunakan multer fields)
interface ProductFiles {
  images?: Express.Multer.File[];
  videos?: Express.Multer.File[];
  variantImages?: {
    [variantIndex: number]: Express.Multer.File[];
  };
}

@injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  private cartesianProduct(arr: string[][]): string[][] {
    return arr.reduce(
      (acc, curr) => acc.flatMap((a) => curr.map((b) => [...a, b])),
      [[]] as string[][],
    );
  }

  // === CREATE PRODUCT ===
  async createProduct(data: CreateProductDTO, files: ProductFiles) {
    const slug = this.slug.create(data.name);

    const existing = await this.prisma.product.findFirst({
      where: { OR: [{ slug: slug }, { sku: data.sku }] },
    });

    if (existing) {
      throw new ApiError(
        "Product with this name/slug or SKU already exists",
        400,
      );
    }

    if (data.priceTiers && data.priceTiers.length > 0) {
      const sortedTiers = data.priceTiers.sort(
        (a, b) => a.minQuantity - b.minQuantity,
      );

      for (let i = 0; i < sortedTiers.length; i++) {
        const current = sortedTiers[i];
        const next = sortedTiers[i + 1];

        if (current.maxQuantity && current.minQuantity > current.maxQuantity) {
          throw new ApiError(
            `Invalid tier range: ${current.minQuantity} - ${current.maxQuantity}`,
            400,
          );
        }

        if (
          next &&
          current.maxQuantity &&
          next.minQuantity <= current.maxQuantity
        ) {
          throw new ApiError(
            `Price tiers overlap between range ending at ${current.maxQuantity} and starting at ${next.minQuantity}`,
            400,
          );
        }
      }
    }
    // Destructure dengan default ke array kosong
    const {
      attributes = [],
      priceTiers = [],
      imagesMetadata = [],
      videosMetadata = [],
      variantImagesMetadata = [],

      ...productCore
    } = data;
    let uploadedImages: {
      url: string;
      publicId: string;
      isFeatured: boolean;
      altText: string;
    }[] = [];

    let uploadedVideos: {
      url: string;
      publicId: string;
      title: string;
      isFeatured: boolean;
      altText: string;
    }[] = [];

    // ============ MEDIA UPLOAD ============
    try {
      if (files.images) {
        for (let i = 0; i < files.images.length; i++) {
          const file = files.images[i];
          const metadata = imagesMetadata?.[i] || {};

          const uploadResult = await this.cloudinary.upload(file, {
            folder: "products",
            resource_type: "image",
          });

          uploadedImages.push({
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            isFeatured: metadata.isFeatured || false,
            altText: metadata.altText || productCore.name || "Product Image",
          });
        }
      }

      // --- LOGIC VIDEO (DIPERBAIKI) ---
      if (files.videos && files.videos.length > 0) {
        // 1. Buat array of Promises (jangan di-await dulu)
        const videoUploadPromises = files.videos.map(async (file, i) => {
          const metadata = videosMetadata?.[i] || {};

          // Upload ke Cloudinary
          const uploadResult = await this.cloudinary.upload(file, {
            folder: "products/videos",
            resource_type: "video",
            // Tambahkan ini untuk video agar loading lebih cepat saat diputar nanti
            eager_async: true,
          });

          return {
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            title: metadata.title || productCore.name || "Product Video",
            isFeatured: metadata.isFeatured || false,
            altText: metadata.altText || productCore.name || "Product Video",
          };
        });

        // 2. Jalankan semua upload video secara bersamaan
        // Ini akan memangkas waktu secara signifikan
        const results = await Promise.all(videoUploadPromises);

        // 3. Masukkan ke array utama
        uploadedVideos.push(...results);
      }
    } catch (error) {
      throw new ApiError("Failed to upload media files to Cloudinary", 500);
    }
    // ======================================

    const newProduct = await this.prisma.$transaction(async (tx) => {
      // 1. CREATE PRODUCT
      const product = await tx.product.create({
        data: {
          ...productCore,
          slug,
          basePrice: productCore.basePrice,
          priceTiers:
            priceTiers.length > 0
              ? {
                  createMany: {
                    data: priceTiers.map((tier) => ({
                      minQuantity: tier.minQuantity,
                      maxQuantity: tier.maxQuantity ?? null,

                      price: tier.price.toString(),
                    })),
                  },
                }
              : undefined,
        },
      });

      // 2. INSERT PRODUCT ATTRIBUTE VALUES
      if (attributes.length > 0) {
        const productAttributeValueData: {
          productId: string;
          attributeValueId: string;
        }[] = [];

        for (const attr of attributes) {
          for (const valueId of attr.valueIds) {
            productAttributeValueData.push({
              productId: product.id,
              attributeValueId: valueId,
            });
          }
        }

        await tx.productAttributeValue.createMany({
          data: productAttributeValueData,
          skipDuplicates: true,
        });
      }

      // 3. AUTO GENERATE VARIANTS
      if (attributes.length > 0) {
        // Ambil semua attributeValue DAN nama attributenya (Warna, Ukuran, dll)
        const allAttributeValues = await this.prisma.attributeValue.findMany({
          where: {
            id: {
              in: attributes.flatMap((attr) => attr.valueIds),
            },
          },
          include: {
            attribute: true, // PENTING: Include nama atribut induknya
          },
        });

        const listOfValueGroups = attributes.map((attr) => attr.valueIds);
        const combinations = this.cartesianProduct(listOfValueGroups);

        const variantCreates = combinations.map((combination, index) => {
          const variantSku = `${productCore.sku}-VAR-${index + 1}`;

          const variantNameParts = combination
            .map((valueId) => {
              const val = allAttributeValues.find((x) => x.id === valueId);
              if (val && val.attribute) {
                // Gabungkan Nama Atribut + Nilainya
                return `${val.attribute.name}: ${val.value}`;
              }
              return "";
            })
            .filter(Boolean);

          const variantName = variantNameParts.join(" • ");

          const meta = variantImagesMetadata.find(
            (m) => m.variantIndex === index,
          );

          const variantPrice = meta?.price
            ? meta.price.toString()
            : productCore.basePrice.toString();
          return {
            sku: variantSku,
            variantName,
            productId: product.id,
            price: variantPrice,
            attributeValues: {
              createMany: {
                data: combination.map((valueId) => ({
                  attributeValueId: valueId,
                })),
              },
            },
          };
        });

        // Batch Insert Variants
        for (const variant of variantCreates) {
          await tx.productVariant.create({ data: variant });
        }
      }

      if (files.variantImages && variantImagesMetadata.length > 0) {
        // ✅ PERBAIKI DI SINI
        const variants = await tx.productVariant.findMany({
          where: { productId: product.id },
          orderBy: { createdAt: "asc" },
        });

        // Iterasi melalui metadata yang dikirim frontend
        for (const variantMeta of variantImagesMetadata) {
          // ✅ VARIANT IMAGES METADATA DARI DATA
          const variantIndex = variantMeta.variantIndex;
          const variant = variants[variantIndex];
          if (!variant) continue;

          // Ambil file yang dipetakan berdasarkan index varian
          // files.variantImages adalah object map { '0': [File], '1': [File], ... }
          const filesForVariant = files.variantImages[variantIndex] || [];

          // Tambahkan console log untuk memastikan filesForVariant ditemukan
          console.log(
            `Processing Variant Index ${variantIndex}: Found ${filesForVariant.length} files.`,
          );

          if (filesForVariant.length === 0) continue;

          const uploadedVariantImages = [];

          for (const file of filesForVariant) {
            const uploaded = await this.cloudinary.upload(file, {
              folder: "products/variants",
              resource_type: "image",
            });

            uploadedVariantImages.push({
              variantId: variant.id,
              url: uploaded.secure_url,
              publicId: uploaded.public_id,
              isFeatured: variantMeta.isFeatured ?? false,
              altText: variantMeta.altText ?? "",
            });
          }

          if (uploadedVariantImages.length > 0) {
            await tx.productVariantImage.createMany({
              data: uploadedVariantImages,
            });
          }
        }
      }
      // 5. INSERT PRODUCT IMAGES
      if (uploadedImages.length > 0) {
        await tx.productImage.createMany({
          data: uploadedImages.map((img) => ({
            ...img,
            productId: product.id,
          })),
        });
      }

      // 6. INSERT PRODUCT VIDEOS
      if (uploadedVideos.length > 0) {
        await tx.productVideo.createMany({
          data: uploadedVideos.map((video) => ({
            ...video,
            productId: product.id,
          })),
        });
      }

      return product;
    });

    return this.getProductById(newProduct.id);
  }

  async updateProductCore(id: string, data: UpdateProductCoreDTO) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Product not found", 404);

    const slug = data.name ? this.slug.create(data.name) : existing.slug;

    // Build conditional OR array tanpa undefined
    const or: any[] = [{ slug }];
    if (data.sku) or.push({ sku: data.sku });

    // Only run duplicate check if we have at least one condition to check
    if (or.length > 0) {
      const duplicate = await this.prisma.product.findFirst({
        where: {
          OR: or,
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new ApiError(
          "Product with this name/slug or SKU already exists",
          400,
        );
      }
    }

    const updateData: any = { slug };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.basePrice !== undefined) updateData.basePrice = data.basePrice;
    if (data.isCustom !== undefined) updateData.isCustom = data.isCustom;
    if (data.materialType !== undefined)
      updateData.materialType = data.materialType;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;

    const updated = await this.prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        images: true,
        videos: true,
        productVariants: true,
        attributeValues: true,
        priceTiers: true,
      },
    });

    return updated;
  }

  async updatePriceTiers(
    id: string,
    data: {
      minQuantity: number;
      maxQuantity?: number;
      price: number | string;
    }[],
  ) {
    // 1. VALIDASI DATA (Sama seperti di createProduct)
    if (data.length > 0) {
      // Urutkan berdasarkan minQuantity
      const sortedTiers = data.sort((a, b) => a.minQuantity - b.minQuantity);

      for (let i = 0; i < sortedTiers.length; i++) {
        const current = sortedTiers[i];
        const next = sortedTiers[i + 1];

        // Cek Min > Max
        if (current.maxQuantity && current.minQuantity > current.maxQuantity) {
          throw new ApiError(
            `Invalid tier range: ${current.minQuantity} - ${current.maxQuantity}`,
            400,
          );
        }

        // Cek Overlap
        if (
          next &&
          current.maxQuantity &&
          next.minQuantity <= current.maxQuantity
        ) {
          throw new ApiError(
            `Price tiers overlap between range ending at ${current.maxQuantity} and starting at ${next.minQuantity}`,
            400,
          );
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.priceTier.deleteMany({ where: { productId: id } });

      // B. Buat Tier Baru (Jika ada data)
      if (data.length > 0) {
        await tx.priceTier.createMany({
          data: data.map((t) => ({
            productId: id,
            minQuantity: t.minQuantity,
            maxQuantity: t.maxQuantity ?? null,
            price: t.price.toString(),
          })),
        });
      }
    });

    return this.getProductById(id);
  }
  // === ADD IMAGE ===
  async addImage(
    id: string,
    file: Express.Multer.File,
    metadata?: { isFeatured?: boolean; altText?: string },
  ) {
    const upload = await this.cloudinary.upload(file, {
      folder: "products",
      resource_type: "image",
    });
    await this.prisma.productImage.create({
      data: {
        productId: id,
        url: upload.secure_url,
        publicId: upload.public_id,
        isFeatured: metadata?.isFeatured || false,
        altText: metadata?.altText || "Product Image",
      },
    });
    // 3. AMBIL DAN KEMBALIKAN SELURUH OBJEK PRODUK DENGAN MEDIA TERBARU
    const updatedProduct = await this.prisma.product.findUnique({
      where: { id },
      include: {
        images: true, // Pastikan ini termasuk semua media yang relevan
        videos: true, // Sertakan juga video jika perlu
        // ... sertakan relasi lain yang dibutuhkan oleh frontend Anda
      },
    });

    if (!updatedProduct)
      throw new ApiError("Product not found after update", 404);

    return updatedProduct;
  }

  // === DELETE IMAGE ===
  async deleteImage(imageId: string) {
    const img = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });
    if (!img) throw new ApiError("Image not found", 404);
    const productId = img.productId;
    await this.cloudinary.remove(img.url);
    await this.prisma.productImage.delete({ where: { id: imageId } });

    const updatedProduct = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        images: true, // Pastikan ini termasuk semua media yang relevan
      },
    });

    if (!updatedProduct)
      throw new ApiError("Product not found after update", 404);

    return updatedProduct;
  }

  // === ADD VIDEO ===
  async addVideo(id: string, file: Express.Multer.File, title?: string) {
    const upload = await this.cloudinary.upload(file, {
      folder: "products",
      resource_type: "video",
    });
    const video = await this.prisma.productVideo.create({
      data: {
        productId: id,
        url: upload.secure_url,
        publicId: upload.public_id,
        title: title || "Product Video",
      },
    });
    return video;
  }

  // === DELETE VIDEO ===
  async deleteVideo(videoId: string) {
    const vid = await this.prisma.productVideo.findUnique({
      where: { id: videoId },
    });
    if (!vid) throw new ApiError("Video not found", 404);
    await this.cloudinary.remove(vid.url);
    await this.prisma.productVideo.delete({ where: { id: videoId } });
    return { message: "Video deleted successfully" };
  }

  async deleteProduct(id: string) {
    // ... (Logika delete/soft-delete)
    throw new ApiError(
      "Product deletion is not implemented/allowed for safety.",
      403,
    );
  }

  async updateProductVariants(
    dto: UpdateProductVariantsDTO, // DTO dari frontend
    files: UpdateProductVariantFiles, // Files dari Multer (varianImages)
  ) {
    const { productId, variants } = dto; // ====================================
    // 1. GET EXISTING VARIANTS (dan Product Core SKU)
    // ====================================

    const existingVariants = await this.prisma.productVariant.findMany({
      where: { productId },
      select: { id: true, sku: true },
    });

    const productCore = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { sku: true },
    });

    if (!productCore) {
      throw new Error("Product not found.");
    }

    const existingIds = existingVariants.map((v) => v.id);

    const incomingIds = variants
      .filter((v) => v.variantId && !v._isDeleted)
      .map((v) => v.variantId); // ====================================
    // 2. DELETE VARIANTS (Kode yang Anda sediakan)
    // ====================================

    const idsToDelete = existingIds
      .filter((id) => !incomingIds.includes(id))
      .concat(
        variants
          .filter((v) => v._isDeleted && v.variantId)
          .map((v) => v.variantId as string),
      );
    if (idsToDelete.length > 0) {
      await this.prisma.productVariantImage.deleteMany({
        where: { variantId: { in: idsToDelete } },
      });

      await this.prisma.productVariantAttributeValue.deleteMany({
        where: { variantId: { in: idsToDelete } },
      });

      await this.prisma.productVariant.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    } // ====================================
    // 3. GET NEXT VARIANT INDEX (Diperlukan untuk SKU baru)
    // ====================================
    // Cari nomor urut varian tertinggi saat ini untuk produk ini
    const lastVariant = await this.prisma.productVariant.findFirst({
      where: { productId },
      orderBy: { sku: "desc" }, // Lebih baik diurutkan berdasarkan SKU untuk menemukan urutan tertinggi
      select: { sku: true },
    });
    let variantIndexCounter = 1;

    if (lastVariant && lastVariant.sku) {
      // Coba ekstrak nomor urut dari SKU (misal: 'PROD-SKU-VAR-10' -> 10)
      const match = lastVariant.sku.match(/-VAR-(\d+)$/);
      if (match) {
        variantIndexCounter = parseInt(match[1]) + 1;
      } else {
        // Fallback jika format SKU tidak sesuai, hitung jumlah varian yang tersisa
        const remainingVariants = await this.prisma.productVariant.count({
          where: { productId },
        });
        variantIndexCounter = remainingVariants + 1;
      }
    } else {
      const remainingVariants = await this.prisma.productVariant.count({
        where: { productId },
      });
      variantIndexCounter = remainingVariants + 1;
    } // ====================================
    // 4. PROCESS EACH VARIANT (CREATE/UPDATE)
    // ====================================

    for (let index = 0; index < variants.length; index++) {
      const v = variants[index];

      if (v._isDeleted) continue;

      let variantId = v.variantId;
      let finalSku = v.sku; // ==========================================================
      // A. CREATE NEW VARIANT
      // ==========================================================

      if (!variantId) {
        // Cek apakah SKU dari frontend kosong atau tidak disediakan
        if (!v.sku || v.sku.trim() === "") {
          // GENERATE SKU BARU (menggunakan productCore.sku yang sudah diambil di awal)
          finalSku = `${productCore.sku}-VAR-${variantIndexCounter}`;
          variantIndexCounter++; // Increment counter untuk varian baru berikutnya
        } // Lakukan CREATE
        const created = await this.prisma.productVariant.create({
          data: {
            productId,
            sku: finalSku, // Menggunakan SKU yang digenerate/dari FE
            price: v.price,
            stock: v.stock,
            variantName: v.variantName,
          },
        });
        variantId = created.id;
      } // ==========================================================
      // B. UPDATE EXISTING VARIANT
      // ==========================================================
      else {
        // Jika v.sku kosong/null, JANGAN HILANGKAN SKU lama. Ambil dari existing.
        if (!v.sku || v.sku.trim() === "") {
          const existing = existingVariants.find((e) => e.id === variantId);
          finalSku = existing?.sku ?? ""; // Gunakan SKU lama
        }
        await this.prisma.productVariant.update({
          where: { id: variantId },
          data: {
            sku: finalSku, // Menggunakan SKU yang dari FE, atau SKU lama yang dipertahankan
            price: v.price,
            stock: v.stock,
            variantName: v.variantName,
          },
        });
      } // ====================================
      // 5. UPDATE VARIANT ATTRIBUTE VALUES
      // ====================================

      await this.prisma.productVariantAttributeValue.deleteMany({
        where: { variantId },
      });

      await this.prisma.productVariantAttributeValue.createMany({
        data: v.attributeValueIds.map((avId) => ({
          variantId,
          attributeValueId: avId,
        })),
        skipDuplicates: true,
      }); // ====================================
      // 6. HANDLE IMAGE FILES (UPLOAD NEW FILES)
      // ====================================

      const FEImages = v.images;
      const allUploadedFiles = files.variantImages || [];

      const uploadedResults = [];

      for (let i = 0; i < FEImages.length; i++) {
        const img = FEImages[i];
        if (img.fileIndex != null) {
          const file = allUploadedFiles[img.fileIndex];
          if (!file) continue; // Asumsi this.cloudinary.upload mengembalikan { secure_url, public_id }

          const upload = await this.cloudinary.upload(file, {
            folder: "products/variants",
            resource_type: "image",
          });

          uploadedResults.push({
            tempIndex: i,
            url: upload.secure_url,
            publicId: upload.public_id,
          });
        }
      } // ====================================
      // 7. DELETE REMOVED IMAGES
      // ====================================

      const dbImages = await this.prisma.productVariantImage.findMany({
        where: { variantId },
        select: { id: true, publicId: true },
      });

      const dbIds = dbImages.map((i) => i.id);
      const incomingIdsImages = FEImages.filter(
        (i) => i.id && !i._isDeleted,
      ).map((i) => i.id);

      const toDelete = dbIds.filter((id) => !incomingIdsImages.includes(id));

      for (const id of toDelete) {
        const img = dbImages.find((x) => x.id === id);
        if (img) {
          await this.cloudinary.remove(img.publicId);
          await this.prisma.productVariantImage.delete({ where: { id } });
        }
      } // ====================================
      // 8. CREATE / UPDATE IMAGES
      // ====================================

      for (let i = 0; i < FEImages.length; i++) {
        const img = FEImages[i];

        if (img._isDeleted) continue; // CREATE NEW IMAGE

        if (!img.id) {
          const uploadInfo = uploadedResults.find((u) => u.tempIndex === i);
          if (!uploadInfo) continue;

          await this.prisma.productVariantImage.create({
            data: {
              variantId,
              url: uploadInfo.url,
              publicId: uploadInfo.publicId,
              isFeatured: img.isFeatured ?? false,
              altText: img.altText ?? "",
            },
          });
        } // UPDATE OLD IMAGE
        else {
          await this.prisma.productVariantImage.update({
            where: { id: img.id },
            data: {
              isFeatured: img.isFeatured,
              altText: img.altText,
            },
          });
        }
      }
    } // ====================================
    // 9. RETURN UPDATED VARIANTS
    // ====================================

    const updatedVariants = await this.prisma.productVariant.findMany({
      where: { productId },
      include: {
        images: {
          orderBy: { isFeatured: "desc" },
        },
        attributeValues: {
          include: {
            attributeValue: {
              include: {
                attribute: true,
              },
            },
          },
        },
      },
    });

    return {
      message: "Product variants updated successfully.",
      variants: updatedVariants,
    };
  }
  async updateProductAttributes(dto: UpdateProductAttributesDTO) {
    const { productId, attributeValueIds } = dto;

    // Ambil attributeValue yang sudah terassign ke produk
    const existing = await this.prisma.productAttributeValue.findMany({
      where: { productId },
      select: { id: true, attributeValueId: true },
    });

    const existingIds = existing.map((v) => v.attributeValueId);

    // Tentukan mana yang harus dihapus
    const toDelete = existingIds.filter(
      (id) => !attributeValueIds.includes(id),
    );

    if (toDelete.length > 0) {
      await this.prisma.productAttributeValue.deleteMany({
        where: {
          productId,
          attributeValueId: { in: toDelete },
        },
      });
    }

    // Tentukan mana yang harus ditambahkan
    const toAdd = attributeValueIds.filter((id) => !existingIds.includes(id));

    if (toAdd.length > 0) {
      await this.prisma.productAttributeValue.createMany({
        data: toAdd.map((id) => ({
          productId,
          attributeValueId: id,
        })),
        skipDuplicates: true,
      });
    }

    return { message: "Product attributes updated successfully." };
  }

  async updateVariantImages(
    productId: string,
    variantId: string,
    metadata: {
      images: {
        id: string | null;
        altText: string | null;
        isFeatured: boolean | null;
      }[];
    },
    files: { images?: Express.Multer.File[] },
  ) {
    // === 1. VALIDATE VARIANT ===
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });

    if (!variant) {
      throw new ApiError("Variant tidak ditemukan pada product ini", 404);
    }

    // === 2. GET EXISTING IMAGES ===
    const existingImages = await this.prisma.productVariantImage.findMany({
      where: { variantId },
    });

    const existingMap = new Map(existingImages.map((img) => [img.id, img]));

    const incomingIds = metadata.images
      .filter((x) => x.id !== null)
      .map((x) => x.id as string);

    // === 3. DELETE IMAGES THAT ARE NOT SENT ANYMORE ===
    for (const old of existingImages) {
      if (!incomingIds.includes(old.id)) {
        // delete from Cloudinary
        try {
          await this.cloudinary.remove(old.publicId);
        } catch (e) {
          console.warn("Cloudinary delete failed", e);
        }

        await this.prisma.productVariantImage.delete({
          where: { id: old.id },
        });
      }
    }

    const resultImages = [];

    // === 4. PROCESS EACH IMAGE COMING FROM FRONTEND ===
    for (let i = 0; i < metadata.images.length; i++) {
      const meta = metadata.images[i];
      const file = files?.images?.[i] || null; // file untuk posisi ini

      // 4A. CREATE NEW IMAGE
      if (meta.id === null) {
        if (!file) {
          throw new ApiError(
            `File untuk image baru index ${i} tidak ditemukan`,
            400,
          );
        }

        const uploaded = await this.cloudinary.upload(file, {
          folder: "products/variants",
          resource_type: "image",
        });

        const created = await this.prisma.productVariantImage.create({
          data: {
            variantId,
            url: uploaded.secure_url,
            publicId: uploaded.public_id,
            altText: meta.altText || "",
            isFeatured: meta.isFeatured ?? false,
          },
        });

        resultImages.push(created);
        continue;
      }

      // 4B. UPDATE EXISTING IMAGE WITHOUT NEW FILE
      if (meta.id && !file) {
        const updated = await this.prisma.productVariantImage.update({
          where: { id: meta.id },
          data: {
            altText: meta.altText ?? undefined,
            isFeatured: meta.isFeatured ?? undefined,
          },
        });

        resultImages.push(updated);
        continue;
      }

      // 4C. UPDATE EXISTING IMAGE + REPLACE FILE
      if (meta.id && file) {
        const old = existingMap.get(meta.id);
        if (!old) continue;

        // delete old from Cloudinary
        try {
          await this.cloudinary.remove(old.publicId);
        } catch (err) {
          console.warn("Failed delete old variant image", err);
        }

        // upload new
        const uploaded = await this.cloudinary.upload(file, {
          folder: "products/variants",
          resource_type: "image",
        });

        const updated = await this.prisma.productVariantImage.update({
          where: { id: meta.id },
          data: {
            url: uploaded.secure_url,
            publicId: uploaded.public_id,
            altText: meta.altText ?? old.altText,
            isFeatured: meta.isFeatured ?? old.isFeatured,
          },
        });

        resultImages.push(updated);
      }
    }

    // === 5. RETURN ORDERED RESULT ===
    const finalImages = await this.prisma.productVariantImage.findMany({
      where: { variantId },
    });

    return {
      message: "Variant images updated successfully",
      images: finalImages,
    };
  }

  async getProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        priceTiers: true,
        images: true,
        videos: true,

        attributeValues: {
          include: {
            attributeValue: {
              include: {
                attribute: true,
              },
            },
          },
        },

        productVariants: {
          orderBy: { createdAt: "asc" },
          include: {
            images: {
              orderBy: { isFeatured: "desc" },
            },
            attributeValues: {
              include: {
                attributeValue: {
                  include: {
                    attribute: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!product) throw new ApiError("Product not found", 404);
    return product;
  }

  async getAllProducts(query: {
    page?: number;
    take?: number;
    search?: string;
    categoryId?: string;
    isCustom?: boolean | string;
  }) {
    const where: any = {};

    // === Filter Pencarian ===
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { sku: { contains: query.search } },
      ];
    }

    // === Filter Kategori ===
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.isCustom !== undefined) {
      if (typeof query.isCustom === "string") {
        where.isCustom = query.isCustom === "true";
      } else {
        where.isCustom = query.isCustom;
      }
    }

    // === Pagination & Query Data ===
    const count = await this.prisma.product.count({ where });
    const data = await this.prisma.product.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { createdAt: "desc" },
      include: { category: true, images: true },
    });

    const meta = this.pagination.generateMeta({
      count,
      page: Number(query.page || 1),
      take: Number(query.take || 10),
    });

    return { data, meta };
  }

  async getAllProductsForOrder(query?: {
    categoryId?: string;
    isCustom?: boolean | string;
  }) {
    try {
      const where: any = {};

      // Filter by category (optional)
      if (query?.categoryId) {
        where.categoryId = query.categoryId;
      }

      // Filter by isCustom (optional)
      if (query?.isCustom !== undefined) {
        if (typeof query.isCustom === "string") {
          where.isCustom = query.isCustom === "true";
        } else {
          where.isCustom = query.isCustom;
        }
      }

      // === Fetch Data ===
      const products = await this.prisma.product.findMany({
        where,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
          basePrice: true,
          isCustom: true,
          category: {
            select: { id: true, name: true },
          },
          // --- TAMBAHAN 1: Ambil Price Tiers ---
          priceTiers: {
            select: {
              id: true,
              minQuantity: true,
              price: true,
            },
            orderBy: { minQuantity: "asc" },
          },
          // --- TAMBAHAN 2: Ambil Product Variants ---
          productVariants: {
            select: {
              id: true,
              variantName: true,
              price: true,
              sku: true,
            },
            // Opsional: urutkan varian
            orderBy: { variantName: "asc" },
          },
        },
      });

      // === Map Response untuk Frontend ===
      return products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        basePrice: p.basePrice,
        isCustom: p.isCustom,
        category: p.category
          ? { id: p.category.id, name: p.category.name }
          : null,

        // Map Price Tiers (Pastikan convert Decimal ke Number jika perlu)
        priceTiers: p.priceTiers.map((tier) => ({
          id: tier.id,
          minQuantity: tier.minQuantity,
          price: Number(tier.price), // Convert Decimal prisma ke number JS
        })),

        // --- TAMBAHAN 3: Map Variants agar tidak undefined di frontend ---
        productVariants: p.productVariants.map((v) => ({
          id: v.id,
          variantName: v.variantName || "Unnamed Variant",
          sku: v.sku,
          // Penting: Convert Decimal ke Number, dan handle null
          price: v.price ? Number(v.price) : 0,
        })),
      }));
    } catch (error) {
      console.error("❌ Error in getAllProductsForOrder:", error);
      throw new Error("Failed to fetch products for order.");
    }
  }
  async exportProductsToExcel(query: ProductExportQuery): Promise<Buffer> {
    const { startDate, endDate, search, categoryId, isCustom } = query;

    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // Tambahkan satu hari agar tanggal akhir inklusif
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.createdAt.lt = end;
      }
    } // Filter by Search (name or sku or slug)

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
        { slug: { contains: search } },
      ];
    }

    // Filter by Category
    if (categoryId) {
      where.categoryId = categoryId;
    }

    // Filter by isCustom status
    if (isCustom && isCustom !== "ALL") {
      where.isCustom = isCustom === "true";
    } // 2. MENGAMBIL DATA DARI DATABASE DENGAN RELASI

    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        sku: true,
        basePrice: true,
        isCustom: true,
        materialType: true,
        createdAt: true,

        category: {
          select: { name: true },
        }, // Ambil Attribute Values

        attributeValues: {
          select: {
            attributeValue: {
              select: { value: true },
            },
            attribute: {
              select: { name: true },
            },
          },
        }, // Ambil Price Tiers

        priceTiers: {
          select: { minQuantity: true, price: true },
          orderBy: { minQuantity: "asc" },
        }, // Hitung jumlah Varian (opsional, untuk ringkasan)

        _count: {
          select: { productVariants: true, images: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }); // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Products"); // Menentukan Kolom (Headers)

    worksheet.columns = [
      { header: "SKU", key: "sku", width: 20 },
      { header: "Nama Produk", key: "name", width: 45 },
      { header: "Kategori", key: "category", width: 30 },
      { header: "Harga Dasar (Rp)", key: "basePrice", width: 20 },
      { header: "Tipe Material", key: "materialType", width: 20 },
      { header: "Dapat Disesuaikan?", key: "isCustom", width: 20 },
      { header: "Attributes", key: "attributes", width: 50 },
      { header: "Price Tiers", key: "priceTiers", width: 50 },
      { header: "Jml. Varian", key: "variantCount", width: 15 },
      { header: "Jml. Gambar", key: "imageCount", width: 15 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ]; // Menambahkan Data Baris

    products.forEach((product) => {
      // Menggabungkan Attributes
      const attributesString = product.attributeValues
        .map(
          (pav) =>
            `${pav.attribute?.name || "N/A"}: ${pav.attributeValue.value}`,
        )
        .join("\n");

      // Menggabungkan Price Tiers
      const priceTiersString = product.priceTiers
        .map(
          (tier) => `Min. Qty ${tier.minQuantity}: Rp ${tier.price.toFixed(2)}`,
        )
        .join("\n");

      worksheet.addRow({
        sku: product.sku,
        name: product.name,
        category: product.category.name,
        basePrice: product.basePrice,
        materialType: product.materialType || "N/A",
        isCustom: product.isCustom ? "Ya" : "Tidak",
        attributes: attributesString || "Tidak Ada",
        priceTiers: priceTiersString || "Harga Tunggal",
        variantCount: product._count.productVariants,
        imageCount: product._count.images,
        createdAt: product.createdAt.toLocaleString("id-ID", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    }); // Styling Header

    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "00A86B" }, // Warna Hijau untuk Produk
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Styling kolom multiline (Attributes dan Price Tiers)
    worksheet
      .getColumn("attributes")
      .eachCell({ includeEmpty: false }, (cell) => {
        cell.alignment = {
          wrapText: true,
          vertical: "top",
          horizontal: "left",
        };
      });
    worksheet
      .getColumn("priceTiers")
      .eachCell({ includeEmpty: false }, (cell) => {
        cell.alignment = {
          wrapText: true,
          vertical: "top",
          horizontal: "left",
        };
      });

    // Formatting Harga Dasar
    worksheet.getColumn("basePrice").numFmt = "#,##0.00"; // 4. MENGHASILKAN BUFFER DAN MENGEMBALIKAN

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }

  async updateProductImageSEO(imageId: string, data: UpdateProductImageDTO) {
    // 1. Cek apakah image ada
    const existingImage = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });

    if (!existingImage) {
      throw new ApiError(`Product Image with ID ${imageId} not found`, 404);
    }
    if (data.isFeatured === true) {
      await this.prisma.productImage.updateMany({
        where: {
          productId: existingImage.productId,
          id: { not: imageId },
        },
        data: { isFeatured: false },
      });
    }

    // 3. Update Image
    const updatedImage = await this.prisma.productImage.update({
      where: { id: imageId },
      data: {
        altText: data.altText ?? undefined,
        isFeatured: data.isFeatured ?? undefined,
      },
    });

    return updatedImage;
  }

  async updateProductVideoSEO(videoId: string, data: UpdateProductVideoDTO) {
    const existingVideo = await this.prisma.productVideo.findUnique({
      where: { id: videoId },
    });

    if (!existingVideo) {
      throw new ApiError(`Product Video with ID ${videoId} not found`, 404);
    }

    if (data.isFeatured === true) {
      await this.prisma.productVideo.updateMany({
        where: {
          productId: existingVideo.productId,
          id: { not: videoId },
        },
        data: { isFeatured: false },
      });
    }

    const updatedVideo = await this.prisma.productVideo.update({
      where: { id: videoId },
      data: {
        title: data.title ?? undefined,
        altText: data.altText ?? undefined,
        isFeatured: data.isFeatured ?? undefined,
      },
    });

    return updatedVideo;
  }

  async upsertProductSEO(productId: string, data: ProductSeoDTO) {
    // 1. Validasi: Pastikan Produknya Ada
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new ApiError(`Product with ID ${productId} not found`, 404);
    }

    // 2. Lakukan Upsert
    // create: dijalankan jika data SEO belum ada
    // update: dijalankan jika data SEO sudah ada
    const seoData = await this.prisma.productSEO.upsert({
      where: {
        productId: productId, // Kunci pencarian (Unique Key)
      },
      create: {
        productId: productId,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        keywords: data.keywords,
        canonicalUrl: data.canonicalUrl,
        ogTitle: data.ogTitle,
        ogDescription: data.ogDescription,
        ogImage: data.ogImage,
        structuredData: data.structuredData,
      },
      update: {
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        keywords: data.keywords,
        canonicalUrl: data.canonicalUrl,
        ogTitle: data.ogTitle,
        ogDescription: data.ogDescription,
        ogImage: data.ogImage,
        structuredData: data.structuredData,
      },
    });

    return seoData;
  }

  // === GET PRODUCT SEO (Optional, untuk menampilkan data di form) ===
  async getProductSEO(productId: string) {
    const seoData = await this.prisma.productSEO.findUnique({
      where: { productId },
    });

    // Return null atau object kosong jika belum ada, agar frontend tidak error
    return seoData || {};
  }
}
