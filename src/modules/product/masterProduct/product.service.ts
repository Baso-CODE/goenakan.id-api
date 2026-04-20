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

    // --- Validasi Price Tiers (Tidak Berubah) ---
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

    const {
      attributes = [],
      priceTiers = [],
      imagesMetadata = [],
      videosMetadata = [],
      tagIds = [],
      variantImagesMetadata = [],
    } = data;

    let uploadedImages: {
      url: string;
      publicId: string;
      isFeatured: boolean;
      altText: string;
    }[] = [];

    const uploadedVideos = videosMetadata.map((meta) => ({
      url: meta.url,
      publicId: meta.publicId || `fe_upload_${Date.now()}_${Math.random()}`,
      title: meta.title || data.name || "Product Video",
      isFeatured: meta.isFeatured || false,
      altText: meta.altText || data.name || "Product Video",
    }));

    // ============ MEDIA UPLOAD (IMAGE ONLY) ============
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
            altText: metadata.altText || data.name || "Product Image",
          });
        }
      }
    } catch (error) {
      throw new ApiError("Failed to upload image files to Cloudinary", 500);
    }

    try {
      const newProduct = await this.prisma.$transaction(async (tx) => {
        // 1. CREATE PRODUCT
        const product = await tx.product.create({
          data: {
            // 🟡 MAPPING EKSPLISIT (Sangat aman dari field siluman)
            name: data.name,
            sku: data.sku,
            description: data.description,
            basePrice: data.basePrice,
            isCustom: data.isCustom,
            materialType: data.materialType,
            weight: data.weight,
            width: data.width,
            height: data.height,
            length: data.length,
            categoryId: data.categoryId,
            slug,

            // Relasi Tag
            tags:
              tagIds.length > 0
                ? {
                    connect: tagIds.map((id) => ({ id })),
                  }
                : undefined,

            // Relasi Price Tiers
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
          const allAttributeValues = await this.prisma.attributeValue.findMany({
            where: {
              id: {
                in: attributes.flatMap((attr) => attr.valueIds),
              },
            },
            include: {
              attribute: true,
            },
          });

          const listOfValueGroups = attributes.map((attr) => attr.valueIds);
          const combinations = this.cartesianProduct(listOfValueGroups);

          const variantCreates = combinations.map((combination, index) => {
            const variantSku = `${data.sku}-VAR-${index + 1}`;

            const variantNameParts = combination
              .map((valueId) => {
                const val = allAttributeValues.find((x) => x.id === valueId);
                if (val && val.attribute) {
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
              : data.basePrice.toString();

            return {
              sku: variantSku,
              variantName,
              productId: product.id,
              price: variantPrice,
              description: meta?.description ?? null,
              weight: meta?.weight ?? null,
              width: meta?.width ?? null,
              height: meta?.height ?? null,
              length: meta?.length ?? null,
              attributeValues: {
                createMany: {
                  data: combination.map((valueId) => ({
                    attributeValueId: valueId,
                  })),
                },
              },
            };
          });

          for (const variant of variantCreates) {
            await tx.productVariant.create({ data: variant });
          }
        }

        // 4. UPLOAD VARIANT IMAGES
        if (files.variantImages && variantImagesMetadata.length > 0) {
          const variants = await tx.productVariant.findMany({
            where: { productId: product.id },
            orderBy: { createdAt: "asc" },
          });

          for (const variantMeta of variantImagesMetadata) {
            const variantIndex = variantMeta.variantIndex;
            const variant = variants[variantIndex];
            if (!variant) continue;

            const filesForVariant = files.variantImages[variantIndex] || [];

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

        if (uploadedImages.length > 0) {
          await tx.productImage.createMany({
            data: uploadedImages.map((img) => ({
              ...img,
              productId: product.id,
            })),
          });
        }

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
    } catch (dbError) {
      console.error("🔥 RAW PRISMA ERROR 🔥", dbError);
      throw new ApiError(
        "Database error occurred while creating product. Please check the backend console for details.",
        500,
      );
    }
  }

  async updateProductCore(id: string, data: UpdateProductCoreDTO) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Product not found", 404);

    const { tagIds, ...productCore } = data;

    const slug = data.name ? this.slug.create(data.name) : existing.slug;

    const or: any[] = [{ slug }];
    if (data.sku) or.push({ sku: data.sku });

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
    if (data.weight !== undefined) updateData.weight = data.weight;
    if (data.width !== undefined) updateData.width = data.width;
    if (data.height !== undefined) updateData.height = data.height;
    if (data.length !== undefined) updateData.length = data.length;

    if (tagIds !== undefined) {
      updateData.tags = {
        set: tagIds.map((tagId) => ({ id: tagId })),
      };
    }

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
        tags: true,
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
        images: true,
        videos: true,
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
  async addVideo(
    id: string,
    data: {
      url: string;
      publicId?: string;
      title?: string;
      altText?: string;
      isFeatured?: boolean;
    },
  ) {
    // 1. Cek apakah produk ada
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new ApiError("Product not found", 404);
    }

    await this.prisma.productVideo.create({
      data: {
        productId: id,
        url: data.url,
        publicId: data.publicId || `manual_${Date.now()}`,
        title: data.title || product.name,
        altText: data.altText || product.name,
        isFeatured: data.isFeatured || false,
      },
    });

    return this.getProductById(id);
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

  // == DELETE PRODUCT (SOFT DELETE) ===
  async deleteProduct(id: string) {
    // ... (Logika delete/soft-delete)
    throw new ApiError(
      "Product deletion is not implemented/allowed for safety.",
      403,
    );
  }

  // === UPDATE PRODUCT VARIANTS (CREATE/UPDATE/DELETE) ===
  async updateProductVariants(
    dto: UpdateProductVariantsDTO,
    files: UpdateProductVariantFiles,
  ) {
    const { productId, variants } = dto;

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
      .map((v) => v.variantId);
    // 2. DELETE VARIANTS (Kode yang Anda sediakan)

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
    }
    // 3. GET NEXT VARIANT INDEX (Diperlukan untuk SKU baru)

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
        const remainingVariants = await this.prisma.productVariant.count({
          where: { productId },
        });
      }
    } else {
      const remainingVariants = await this.prisma.productVariant.count({
        where: { productId },
      });
      variantIndexCounter = remainingVariants + 1;
    }
    // 4. PROCESS EACH VARIANT (CREATE/UPDATE)

    for (let index = 0; index < variants.length; index++) {
      const v = variants[index];

      if (v._isDeleted) continue;

      let variantId = v.variantId;
      let finalSku = v.sku;

      if (!variantId) {
        if (!v.sku || v.sku.trim() === "") {
          finalSku = `${productCore.sku}-VAR-${variantIndexCounter}`;
          variantIndexCounter++;
        }
        const created = await this.prisma.productVariant.create({
          data: {
            productId,
            sku: finalSku,
            price: v.price,
            description: v.description ?? null,
            stock: v.stock,
            variantName: v.variantName,
            weight: v.weight ?? null,
            width: v.width ?? null,
            height: v.height ?? null,
            length: v.length ?? null,
          },
        });
        variantId = created.id;
      } else {
        if (!v.sku || v.sku.trim() === "") {
          const existing = existingVariants.find((e) => e.id === variantId);
          finalSku = existing?.sku ?? "";
        }
        await this.prisma.productVariant.update({
          where: { id: variantId },
          data: {
            sku: finalSku,
            price: v.price,
            stock: v.stock,
            variantName: v.variantName,
            description: v.description ?? null,
            weight: v.weight ?? null,
            width: v.width ?? null,
            height: v.height ?? null,
            length: v.length ?? null,
          },
        });
      }

      await this.prisma.productVariantAttributeValue.deleteMany({
        where: { variantId },
      });

      await this.prisma.productVariantAttributeValue.createMany({
        data: v.attributeValueIds.map((avId) => ({
          variantId,
          attributeValueId: avId,
        })),
        skipDuplicates: true,
      });

      const FEImages = v.images;
      const allUploadedFiles = files.variantImages || [];

      const uploadedResults = [];

      for (let i = 0; i < FEImages.length; i++) {
        const img = FEImages[i];
        if (img.fileIndex != null) {
          const file = allUploadedFiles[img.fileIndex];
          if (!file) continue;

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
      }
      // 7. DELETE REMOVED IMAGES

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
      }

      for (let i = 0; i < FEImages.length; i++) {
        const img = FEImages[i];

        if (img._isDeleted) continue;

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
    }
    // 9. RETURN UPDATED VARIANTS

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

  // === UPDATE PRODUCT ATTRIBUTES (CREATE/DELETE) ===
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

  // === UPDATE VARIANT IMAGES (CREATE/UPDATE/DELETE) ===
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

  // === GET PRODUCT BY ID (INCLUDE MEDIA, VARIANTS, ATTRIBUTES) ===
  async getProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        priceTiers: true,
        images: true,
        videos: true,
        tags: true,

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

  // === GET ALL PRODUCTS (WITH PAGINATION, SEARCH, FILTER) ===
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

  // === GET ALL PRODUCTS FOR ORDER (WITHOUT PAGINATION, BUT WITH CATEGORY & CUSTOM FILTER) ===
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
          description: true,
          category: {
            select: { id: true, name_id: true },
          },
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
          ? { id: p.category.id, name: p.category.name_id }
          : null,
        priceTiers: p.priceTiers.map((tier) => ({
          id: tier.id,
          minQuantity: tier.minQuantity,
          price: Number(tier.price),
        })),

        productVariants: p.productVariants.map((v) => ({
          id: v.id,
          variantName: v.variantName || "Unnamed Variant",
          sku: v.sku,
          price: v.price ? Number(v.price) : 0,
        })),
      }));
    } catch (error) {
      console.error("❌ Error in getAllProductsForOrder:", error);
      throw new Error("Failed to fetch products for order.");
    }
  }

  // === EXPORT PRODUCTS TO EXCEL (DENGAN FILTERING) ===
  async exportProductsToExcel(query: ProductExportQuery): Promise<Buffer> {
    const { startDate, endDate, search, categoryId, isCustom } = query;

    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.createdAt.lt = end;
      }
    }

    // Filter by Search (name or sku or slug)
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
    }

    // 2. MENGAMBIL DATA DARI DATABASE DENGAN RELASI
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
          // 🔄 UPDATE: Ambil nama kategori dari kolom yang baru (name_id)
          select: { name_id: true },
        },

        // Ambil Attribute Values
        attributeValues: {
          select: {
            attributeValue: {
              select: { value: true },
            },
            attribute: {
              select: { name: true },
            },
          },
        },

        // Ambil Price Tiers
        priceTiers: {
          select: { minQuantity: true, price: true },
          orderBy: { minQuantity: "asc" },
        },

        // Hitung jumlah Varian (opsional, untuk ringkasan)
        _count: {
          select: { productVariants: true, images: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Products");

    // Menentukan Kolom (Headers)
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
    ];

    // Menambahkan Data Baris
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
        category: product.category?.name_id || "Uncategorized",
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
    });

    // Styling Header
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
    worksheet.getColumn("basePrice").numFmt = "#,##0.00";

    // 4. MENGHASILKAN BUFFER DAN MENGEMBALIKAN
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }

  // === UPDATE PRODUCT IMAGE SEO (ALT TEXT & FEATURED) ===
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

  // === UPDATE PRODUCT VIDEO SEO (TITLE, ALT TEXT & FEATURED) ===
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

  // === UPSERT PRODUCT SEO (META TITLE, DESCRIPTION, KEYWORDS, DLL) ===
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

  // === GENERATE SKU OTOMATIS BERBASIS NAMA PRODUK ===
  async generateSku(productName: string): Promise<string> {
    if (!productName) {
      throw new ApiError("Product Name is required to generate SKU", 400);
    }

    const words = productName.trim().split(/\s+/);
    let prefix = "";

    if (words.length >= 2) {
      prefix = (words[0][0] + words[1][0]).toUpperCase();
    } else if (words.length === 1 && words[0].length >= 2) {
      prefix = words[0].substring(0, 2).toUpperCase();
    } else {
      prefix = (words[0][0] + "X").toUpperCase();
    }

    const lastProduct = await this.prisma.product.findFirst({
      where: {
        sku: {
          startsWith: prefix,
        },
      },
      orderBy: {
        sku: "desc",
      },
      select: {
        sku: true,
      },
    });

    let nextSequence = 1;

    if (lastProduct && lastProduct.sku) {
      const numericPart = lastProduct.sku.replace(prefix, "");
      const lastNumber = parseInt(numericPart, 10);

      if (!isNaN(lastNumber)) {
        nextSequence = lastNumber + 1;
      }
    }

    const newSku = `${prefix}${nextSequence.toString().padStart(4, "0")}`;

    return newSku;
  }

  // GET TOP SELLING PRODUCTS
  async getTopSellingProducts(query?: {
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const limit = Number(query?.limit || 5);
    const dateFilter: any = {};

    // Filter tanggal jika ada (opsional)
    if (query?.startDate || query?.endDate) {
      dateFilter.createdAt = {};
      if (query.startDate) {
        dateFilter.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setDate(end.getDate() + 1); // +1 hari agar inklusif
        dateFilter.createdAt.lt = end;
      }
    }

    // 1. Group by productId dan hitung total quantity terjual
    const topSelling = await this.prisma.orderProduct.groupBy({
      by: ["productId"],
      _sum: {
        quantity: true,
      },

      where: {
        order: {
          ...dateFilter,
        },
      },
      orderBy: {
        _sum: {
          quantity: "desc",
        },
      },
      take: limit,
    });

    // 2. Ambil detail produk berdasarkan ID hasil grouping
    const productIds = topSelling.map((item) => item.productId);

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        basePrice: true,
        category: {
          // 🔄 UPDATE: Ambil nama kategori dari kolom yang baru (name_id)
          select: { name_id: true },
        },
        images: {
          take: 1,
          orderBy: {
            isFeatured: "desc",
          },
          select: { url: true },
        },
      },
    });

    // 3. Gabungkan data agregat dengan detail produk
    const result = topSelling.map((item) => {
      const product = products.find((p) => p.id === item.productId);

      const totalSold = item._sum.quantity || 0;
      const estimatedRevenue = Number(product?.basePrice || 0) * totalSold;

      let status = "Stable";
      if (totalSold > 100) status = "Trending";
      if (totalSold < 10) status = "Slow";

      return {
        id: item.productId,
        name: product?.name || "Unknown Product",
        sku: product?.sku || "-",

        // 🔄 UPDATE: Gunakan name_id untuk ditampilkan di frontend Admin
        category: product?.category?.name_id || "Uncategorized",

        sold: totalSold,
        revenue: estimatedRevenue,
        image: product?.images[0]?.url || null,
        status: status,
      };
    });

    return result;
  }

  // === GET ALL PRODUCTS PUBLIC (WITH PAGINATION, SEARCH, AND ADVANCED FILTERS) ===
  async getAllProductsPublic(query: {
    page?: number;
    take?: number;
    search?: string;
    categoryId?: string; // Biasanya dipakai Admin
    category?: string; // Biasanya dipakai Client (Nama Kategori)
    isCustom?: boolean | string;
    color?: string; // Filter Client
    size?: string; // Filter Client
    price?: string; // Filter Client
    availability?: string; // Filter Client
    sort?: string; // Filter Client
  }) {
    const where: any = {};

    // 1. Filter Pencarian (Search)
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } }, // Asumsi nama produk tetap 'name' bukan 'name_id'
        { sku: { contains: query.search } },
      ];
    }

    // 2. Filter Custom Status
    if (query.isCustom !== undefined) {
      if (typeof query.isCustom === "string") {
        where.isCustom = query.isCustom === "true";
      } else {
        where.isCustom = query.isCustom;
      }
    }

    // 3. Filter Kategori (Mendukung Admin: categoryId, atau Client: category name)
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    } else if (query.category && query.category !== "all") {
      // Ingat: Tabel kategori kita sekarang pakai name_id
      where.category = {
        name_id: { equals: query.category },
      };
    }

    // 4. Filter Attribute (Warna & Ukuran) menggunakan Relasi Prisma
    if (
      (query.color && query.color !== "all") ||
      (query.size && query.size !== "all")
    ) {
      where.AND = []; // Siapkan array AND untuk kondisi multiple attributes

      if (query.color && query.color !== "all") {
        where.AND.push({
          attributeValues: {
            some: {
              attributeValue: { value: query.color },
              // Sesuaikan "Color" dengan nama attribute di database kamu (misal: "Warna")
              attribute: { name: "Color" },
            },
          },
        });
      }

      if (query.size && query.size !== "all") {
        where.AND.push({
          attributeValues: {
            some: {
              attributeValue: { value: query.size },
              // Sesuaikan "Size" dengan nama attribute di database kamu (misal: "Ukuran")
              attribute: { name: "Size" },
            },
          },
        });
      }
    }

    // 5. Filter Rentang Harga (Base Price)
    if (query.price && query.price !== "all") {
      if (query.price === "under_20000") {
        where.basePrice = { lt: 20000 };
      } else if (query.price === "20000_50000") {
        where.basePrice = { gte: 20000, lte: 50000 };
      } else if (query.price === "above_50000") {
        where.basePrice = { gt: 50000 };
      }
    }

    // 6. Filter Ketersediaan (Availability / Stock)
    if (query.availability && query.availability !== "all") {
      // CATATAN: Ganti 'stock' dengan field aktual di schema kamu (misal qty, inventory, atau isAvailable)
      // Jika kamu belum punya field stock, kamu bisa mengabaikan blok ini sementara.
      if (query.availability === "in_stock") {
        // where.stock = { gt: 0 };
      } else if (query.availability === "out_of_stock") {
        // where.stock = { equals: 0 };
      }
    }

    // 7. Pengurutan Data (Sorting)
    let orderBy: any = { createdAt: "desc" }; // Default pengurutan

    if (query.sort) {
      switch (query.sort) {
        case "newest":
          orderBy = { createdAt: "desc" };
          break;
        case "price_asc":
          orderBy = { basePrice: "asc" };
          break;
        case "price_desc":
          orderBy = { basePrice: "desc" };
          break;
        case "best_selling":
          // CATATAN: Jika kamu punya kolom 'sold', gunakan ini. Jika tidak, fallback ke createdAt
          // orderBy = { sold: "desc" };
          break;
      }
    }

    // === Pagination & Query Data ===
    const page = Number(query.page || 1);
    const take = Number(query.take || 6);

    const [count, rawData] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * take,
        take: take,
        orderBy,
        include: {
          category: true,
          // ✨ 1. Ambil 1 gambar utama (Featured) untuk Product Card
          images: {
            take: 1,
            orderBy: { isFeatured: "desc" },
          },
          // ✨ 2. Ambil Price Tiers untuk harga Bulk & Min Order
          priceTiers: {
            orderBy: { minQuantity: "asc" },
          },
          // ✨ 3. Ambil data Order untuk menghitung berapa banyak yang sudah terjual
          orderProducts: {
            select: { quantity: true },
          },
        },
      }),
    ]);

    const formattedData = rawData.map((product) => {
      // Hitung Total Terjual (Jumlahkan semua quantity dari OrderProduct)
      // *Jika schema OrderProduct kamu menggunakan nama field lain untuk jumlah barang, ganti 'quantity' dengan field tersebut.
      const totalSold = product.orderProducts.reduce(
        (sum, order) => sum + (order.quantity || 1),
        0,
      );

      // Konversi harga dasar
      const regularPrice = Number(product.basePrice);

      // Hitung Harga Grosir (Bulk Price) dan Minimal Order
      let bulkPrice = regularPrice;
      let minOrder = 1;

      if (product.priceTiers && product.priceTiers.length > 0) {
        // Ambil harga yang paling murah dari Tiers (Biasanya tier dengan qty terbanyak)
        const cheapestTier = [...product.priceTiers].sort(
          (a, b) => Number(a.price) - Number(b.price),
        )[0];

        bulkPrice = Number(cheapestTier.price);
        minOrder = cheapestTier.minQuantity;
      }

      // Ambil Image URL
      const imageUrl =
        product.images.length > 0
          ? product.images[0].url
          : "/images/placeholder.jpg";

      return {
        id: product.id,
        name: product.name,
        image: imageUrl,
        regularPrice: regularPrice,
        bulkPrice: bulkPrice,
        minOrder: minOrder,
        sold: totalSold,
        // --- Data pendukung lainnya ---
        isCustom: product.isCustom,
        categoryId: product.categoryId,
        categoryName: product.category?.name_id || "",
        slug: product.slug,
      };
    });

    const meta = this.pagination.generateMeta({
      count,
      page,
      take,
    });

    return { data: formattedData, meta };
  }

  // === GET BEST SELLER PRODUCTS (CLIENT HOME PAGE) ===
  async getBestSellerProducts() {
    try {
      const topSelling = await this.prisma.orderProduct.groupBy({
        by: ["productId"],
        _sum: {
          quantity: true,
        },
        orderBy: {
          _sum: {
            quantity: "desc",
          },
        },
        take: 6, // Ambil batas maksimal 6 produk
      });

      const productIds = topSelling.map((item) => item.productId);

      // ✨ PERBAIKAN: Berikan tipe 'any[]' secara eksplisit
      let rawProducts: any[] = [];

      // 2. Ambil detail produk berdasarkan ID yang laris tersebut
      if (productIds.length > 0) {
        rawProducts = await this.prisma.product.findMany({
          where: {
            id: { in: productIds },
          },
          include: {
            category: true,
            images: {
              take: 1,
              orderBy: { isFeatured: "desc" },
            },
            priceTiers: {
              orderBy: { minQuantity: "asc" },
            },
            orderProducts: {
              select: { quantity: true },
            },
          },
        });
      }

      // 3. FALLBACK: Jika belum ada penjualan sama sekali, ambil 6 produk terbaru
      if (rawProducts.length === 0) {
        rawProducts = await this.prisma.product.findMany({
          take: 6,
          orderBy: { createdAt: "desc" },
          include: {
            category: true,
            images: {
              take: 1,
              orderBy: { isFeatured: "desc" },
            },
            priceTiers: {
              orderBy: { minQuantity: "asc" },
            },
            orderProducts: {
              select: { quantity: true },
            },
          },
        });
      }

      // 4. Transformasi/Mapping Data agar cocok dengan ProductCard di Front-End
      const formattedData = rawProducts.map((product) => {
        // Hitung total terjual
        const totalSold = product.orderProducts.reduce(
          (sum: number, order: any) => sum + (order.quantity || 1),
          0,
        );

        const regularPrice = Number(product.basePrice);
        let bulkPrice = regularPrice;
        let minOrder = 1;

        if (product.priceTiers && product.priceTiers.length > 0) {
          const cheapestTier = [...product.priceTiers].sort(
            (a, b) => Number(a.price) - Number(b.price),
          )[0];
          bulkPrice = Number(cheapestTier.price);
          minOrder = cheapestTier.minQuantity;
        }

        const imageUrl =
          product.images.length > 0
            ? product.images[0].url
            : "/images/placeholder.jpg";

        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          image: imageUrl,
          regularPrice: regularPrice,
          bulkPrice: bulkPrice,
          minOrder: minOrder,
          sold: totalSold,
          isCustom: product.isCustom,
          categoryName: product.category?.name_id || "",
        };
      });

      formattedData.sort((a, b) => b.sold - a.sold);

      return {
        success: true,
        data: formattedData,
      };
    } catch (error) {
      console.error("❌ Error Get Best Seller Products:", error);
      throw new Error("Failed to fetch best seller products");
    }
  }
}
