import { translate } from "@vitalets/google-translate-api";
import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { CloudinaryService } from "../../../cloudinary/cloudinary.service";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CurrencyConversionService } from "../../currency/convertionCurrency.service";
import { BatchPriceModifierDTO } from "./dto/batchPriceModifier.dto";
import { CreatePriceTierDTO, CreateProductDTO } from "./dto/createProduct.dto";
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
    private readonly currencyConversion: CurrencyConversionService,
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

    let itemNameString: string | null = null;
    if (data.itemNameId) {
      const itemNameData = await this.prisma.itemName.findUnique({
        where: { id: data.itemNameId },
        include: { itemCategory: true },
      });

      if (!itemNameData) {
        throw new ApiError("Item Name yang dipilih tidak ditemukan", 404);
      }
      itemNameString = itemNameData.name;
    }

    let translatedNameEn: string | null = null;
    let translatedDescEn: string | null = null;

    if (data.name) {
      translatedNameEn = await this.translateProductNameWithItemName(
        data.name,
        data.itemNameId,
        itemNameString,
      );
    }

    if (data.description) {
      translatedDescEn = await this.translateProductDescription(
        data.description,
      );
    }

    // --- Helper untuk Validasi Price Tiers (Bisa dipakai ulang) ---
    const validateTiers = (tiers: CreatePriceTierDTO[], context: string) => {
      const sortedTiers = tiers.sort((a, b) => a.minQuantity - b.minQuantity);
      for (let i = 0; i < sortedTiers.length; i++) {
        const current = sortedTiers[i];
        const next = sortedTiers[i + 1];

        if (current.maxQuantity && current.minQuantity > current.maxQuantity) {
          throw new ApiError(
            `Invalid tier range in ${context}: ${current.minQuantity} - ${current.maxQuantity}`,
            400,
          );
        }

        if (
          next &&
          current.maxQuantity &&
          next.minQuantity <= current.maxQuantity
        ) {
          throw new ApiError(
            `Price tiers overlap in ${context} between range ending at ${current.maxQuantity} and starting at ${next.minQuantity}`,
            400,
          );
        }
      }
    };

    // --- Validasi Price Tiers Produk Utama ---
    if (data.priceTiers && data.priceTiers.length > 0) {
      validateTiers(data.priceTiers, "Base Product");
    }

    // --- Validasi Price Tiers untuk setiap Varian ---
    if (data.variantImagesMetadata && data.variantImagesMetadata.length > 0) {
      data.variantImagesMetadata.forEach((meta) => {
        if (meta.priceTiers && meta.priceTiers.length > 0) {
          validateTiers(meta.priceTiers, `Variant Index ${meta.variantIndex}`);
        }
      });
    }

    // ============ TRANSLATE DESCRIPTION ============
    // Kita lakukan terjemahan di luar transaksi database agar lebih aman dan cepat
    let translatedDescriptionEn: string | null = null;
    if (data.description) {
      try {
        const res = await translate(data.description, { to: "en" });
        translatedDescriptionEn = res.text;
      } catch (error) {
        console.error("Gagal menerjemahkan deskripsi produk:", error);
        // Jika gagal, biarkan menjadi null agar proses pembuatan produk tetap berjalan
        translatedDescriptionEn = null;
      }
    }
    // ===============================================

    const {
      attributes = [],
      priceTiers = [],
      imagesMetadata = [],
      videosMetadata = [],
      tagIds = [],
      variantImagesMetadata = [],
      createdAttributeIds = [],
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
      if (imagesMetadata && imagesMetadata.length > 0) {
        for (const meta of imagesMetadata) {
          if (meta.url) {
            uploadedImages.push({
              url: meta.url,
              publicId:
                meta.publicId || `fe_link_${Date.now()}_${Math.random()}`,
              isFeatured: meta.isFeatured || false,
              altText: meta.altText || data.name || "Product Image",
            });
          }
        }
      }

      if (files.images) {
        const fileMetadataList = (imagesMetadata || []).filter((m) => !m.url);
        for (let i = 0; i < files.images.length; i++) {
          const file = files.images[i];
          const metadata = fileMetadataList[i] || {};

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

    const isProductActive =
      data.isActive !== undefined
        ? typeof data.isActive === "string"
          ? data.isActive === "true"
          : Boolean(data.isActive)
        : true;

    if (isProductActive) {
      if (data.categoryId) {
        const cat = await this.prisma.productCategory.findUnique({
          where: { id: data.categoryId },
          select: { isActive: true, name_id: true },
        });
        if (cat && !cat.isActive) {
          throw new ApiError(
            `Kategori "${cat.name_id}" sedang nonaktif. Tidak dapat membuat produk aktif menggunakan kategori yang nonaktif.`,
            400,
          );
        }
      }
      if (data.itemCategoryId) {
        const ic = await this.prisma.itemCategory.findUnique({
          where: { id: data.itemCategoryId },
          select: { isActive: true, name: true },
        });
        if (ic && !ic.isActive) {
          throw new ApiError(
            `Item category "${ic.name}" sedang nonaktif. Tidak dapat membuat produk aktif menggunakan item category yang nonaktif.`,
            400,
          );
        }
      }
      if (data.itemNameId) {
        const iname = await this.prisma.itemName.findUnique({
          where: { id: data.itemNameId },
          select: { isActive: true, name: true },
        });
        if (iname && !iname.isActive) {
          throw new ApiError(
            `Item name "${iname.name}" sedang nonaktif. Tidak dapat membuat produk aktif menggunakan item name yang nonaktif.`,
            400,
          );
        }
      }
      if (data.materialTypeId) {
        const mat = await this.prisma.materialType.findUnique({
          where: { id: data.materialTypeId },
          select: { isActive: true, name: true },
        });
        if (mat && !mat.isActive) {
          throw new ApiError(
            `Material "${mat.name}" sedang nonaktif. Tidak dapat membuat produk aktif menggunakan material yang nonaktif.`,
            400,
          );
        }
      }
    }

    try {
      const newProduct = await this.prisma.$transaction(async (tx) => {
        // 1. CREATE PRODUCT
        const product = await tx.product.create({
          data: {
            name: data.name,
            name_en: null,
            sku: data.sku,
            description: data.description,
            description_en: translatedDescriptionEn, // <-- Dimasukkan di sini
            basePrice: data.basePrice,
            foreignPrice:
              data.foreignPrice !== undefined && data.foreignPrice !== null
                ? data.foreignPrice.toString()
                : null,
            currencyCode: data.currencyCode || "IDR",
            exchangeRate:
              data.exchangeRate !== undefined && data.exchangeRate !== null
                ? data.exchangeRate.toString()
                : null,
            additionalFee:
              data.additionalFee !== undefined && data.additionalFee !== null
                ? data.additionalFee.toString()
                : null,
            isCustom: data.isCustom,
            isSample: data.isSample || false,
            isMadeByOrder: data.isMadeByOrder || false,
            isActive:
              data.isActive !== undefined
                ? typeof data.isActive === "string"
                  ? data.isActive === "true"
                  : Boolean(data.isActive)
                : true,
            materialTypeId: data.materialTypeId,
            stock: !data.isCustom ? data.stock || 0 : 0,
            weight: data.weight,
            width: data.width,
            height: data.height,
            length: data.length,
            categoryId: data.categoryId,
            itemCategoryId: data.itemCategoryId,
            itemNameId: data.itemNameId,
            slug,
            mockupAreaX:
              data.mockupAreaX !== undefined ? data.mockupAreaX : null,
            mockupAreaY:
              data.mockupAreaY !== undefined ? data.mockupAreaY : null,
            mockupAreaWidth:
              data.mockupAreaWidth !== undefined ? data.mockupAreaWidth : null,
            mockupAreaHeight:
              data.mockupAreaHeight !== undefined
                ? data.mockupAreaHeight
                : null,
            colorMockupTrigger: data.colorMockupTrigger || "NONE",
            tags:
              tagIds.length > 0
                ? { connect: tagIds.map((id) => ({ id })) }
                : undefined,
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
            attributeId: string;
            priceModifier: number;
            weight: number | null;
            width: number | null;
            height: number | null;
            length: number | null;
          }[] = [];

          for (const attr of attributes) {
            for (const valueId of attr.valueIds) {
              const modifier =
                attr.priceModifiers?.[valueId] !== undefined
                  ? Number(attr.priceModifiers[valueId])
                  : 0;
              const weightVal =
                attr.weights?.[valueId] !== undefined &&
                attr.weights[valueId] !== null
                  ? Number(attr.weights[valueId])
                  : null;
              const widthVal =
                attr.widths?.[valueId] !== undefined &&
                attr.widths[valueId] !== null
                  ? Number(attr.widths[valueId])
                  : null;
              const heightVal =
                attr.heights?.[valueId] !== undefined &&
                attr.heights[valueId] !== null
                  ? Number(attr.heights[valueId])
                  : null;
              const lengthVal =
                attr.lengths?.[valueId] !== undefined &&
                attr.lengths[valueId] !== null
                  ? Number(attr.lengths[valueId])
                  : null;

              productAttributeValueData.push({
                productId: product.id,
                attributeValueId: valueId,
                attributeId: attr.attributeId,
                priceModifier: modifier,
                weight: weightVal,
                width: widthVal,
                height: heightVal,
                length: lengthVal,
              });
            }
          }

          await tx.productAttributeValue.createMany({
            data: productAttributeValueData,
            skipDuplicates: true,
          });
        }

        // 2.5 UPDATE PRODUCT ID FOR NEWLY CREATED ATTRIBUTES
        if (createdAttributeIds && createdAttributeIds.length > 0) {
          await tx.attribute.updateMany({
            where: { id: { in: createdAttributeIds } },
            data: { productId: product.id },
          });
        }

        // 3. AUTO GENERATE VARIANTS
        if (attributes.length > 0) {
          const allAttributeValues = await this.prisma.attributeValue.findMany({
            where: {
              id: { in: attributes.flatMap((attr) => attr.valueIds) },
            },
            include: { attribute: true },
          });

          const variantGeneratingAttributes = attributes.filter(
            (attr) => attr.isVariantGenerator !== false,
          );
          const listOfValueGroups = variantGeneratingAttributes.map(
            (attr) => attr.valueIds,
          );
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
              stock: data.isCustom ? meta?.stock || 0 : 0,
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
              priceTiers:
                meta?.priceTiers && meta.priceTiers.length > 0
                  ? {
                      createMany: {
                        data: meta.priceTiers.map((tier) => ({
                          minQuantity: tier.minQuantity,
                          maxQuantity: tier.maxQuantity ?? null,
                          price: tier.price.toString(),
                        })),
                      },
                    }
                  : undefined,
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
            data: uploadedImages.map((img, index) => ({
              ...img,
              productId: product.id,
              sortOrder: index,
            })),
          });
        }

        if (uploadedVideos.length > 0) {
          await tx.productVideo.createMany({
            data: uploadedVideos.map((video, index) => ({
              ...video,
              productId: product.id,
              sortOrder: index,
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

  // ====================================================================
  // UPDATE PRODUCT CORE
  // ====================================================================
  async updateProductCore(id: string, data: UpdateProductCoreDTO) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { itemName: true },
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

    // Auto-translate ke bahasa Inggris jika nama/deskripsi diubah atau belum ada terjemahan (null)
    let translatedNameEn: string | undefined = undefined;
    let translatedDescEn: string | undefined = undefined;

    const effectiveName = data.name !== undefined ? data.name : existing.name;
    const isNameChanged =
      data.name !== undefined && data.name !== existing.name;
    const shouldTranslateName = isNameChanged || !existing.name_en;

    if (shouldTranslateName && effectiveName) {
      const effectiveItemNameId =
        data.itemNameId !== undefined ? data.itemNameId : existing.itemNameId;
      const cachedItemName =
        data.itemNameId === undefined || data.itemNameId === existing.itemNameId
          ? existing.itemName?.name
          : undefined;

      const resName = await this.translateProductNameWithItemName(
        effectiveName,
        effectiveItemNameId,
        cachedItemName,
      );
      if (resName) {
        translatedNameEn = resName;
      }
    }

    const effectiveDesc =
      data.description !== undefined ? data.description : existing.description;
    const isDescChanged =
      data.description !== undefined && data.description !== existing.description;
    const shouldTranslateDesc = isDescChanged || !existing.description_en;

    if (shouldTranslateDesc && effectiveDesc) {
      const resDesc = await this.translateProductDescription(effectiveDesc);
      if (resDesc) {
        translatedDescEn = resDesc;
      }
    }

    const updateData: any = {
      slug,
      materialTypeId:
        data.materialTypeId !== undefined
          ? data.materialTypeId
          : existing.materialTypeId,
    };

    // ✨ Jika nama diubah, ubah namanya dan set versi Inggris ke null
    // (Bisa juga ditambahkan auto-translate jika kamu butuh ke depannya)
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (translatedNameEn !== undefined) {
      updateData.name_en = translatedNameEn;
    }

    // ====================================================================
    // ✨ UPDATE & TRANSLATE DESCRIPTION
    // ====================================================================
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (translatedDescEn !== undefined) {
      updateData.description_en = translatedDescEn;
    }
    // ====================================================================

    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.basePrice !== undefined) updateData.basePrice = data.basePrice;

    if (data.isCustom !== undefined) {
      updateData.isCustom = data.isCustom;
      if (data.isCustom === true) updateData.stock = 0;
    }

    if (data.isSample !== undefined) {
      updateData.isSample =
        typeof data.isSample === "string"
          ? data.isSample === "true"
          : Boolean(data.isSample);
    }

    if (data.isMadeByOrder !== undefined) {
      updateData.isMadeByOrder = data.isMadeByOrder;
    }

    if (data.isActive !== undefined) {
      updateData.isActive =
        typeof data.isActive === "string"
          ? data.isActive === "true"
          : Boolean(data.isActive);
    }

    if (data.stock !== undefined) {
      const isCustomStatus = data.isCustom ?? existing.isCustom;
      updateData.stock = isCustomStatus ? 0 : data.stock;
    }

    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;

    if (data.itemCategoryId !== undefined)
      updateData.itemCategoryId = data.itemCategoryId;
    if (data.itemNameId !== undefined) updateData.itemNameId = data.itemNameId;

    if (data.weight !== undefined) updateData.weight = data.weight;
    if (data.width !== undefined) updateData.width = data.width;
    if (data.height !== undefined) updateData.height = data.height;
    if (data.length !== undefined) updateData.length = data.length;

    if (data.mockupAreaX !== undefined)
      updateData.mockupAreaX = data.mockupAreaX;
    if (data.mockupAreaY !== undefined)
      updateData.mockupAreaY = data.mockupAreaY;
    if (data.mockupAreaWidth !== undefined)
      updateData.mockupAreaWidth = data.mockupAreaWidth;
    if (data.mockupAreaHeight !== undefined)
      updateData.mockupAreaHeight = data.mockupAreaHeight;

    if (data.isMultiFace !== undefined)
      updateData.isMultiFace = data.isMultiFace;
    if (data.mockupFrontImageId !== undefined)
      updateData.mockupFrontImageId = data.mockupFrontImageId;
    if (data.mockupBackImageId !== undefined)
      updateData.mockupBackImageId = data.mockupBackImageId;

    if (data.colorMockupTrigger !== undefined) {
      updateData.colorMockupTrigger = data.colorMockupTrigger;
    }

    // Sync Tags
    if (tagIds !== undefined) {
      updateData.tags = {
        set: tagIds.map((tagId) => ({ id: tagId })),
      };
    }

    const resultingIsActive =
      updateData.isActive !== undefined
        ? updateData.isActive
        : existing.isActive;

    if (resultingIsActive) {
      const catId = updateData.categoryId || existing.categoryId;
      if (catId) {
        const cat = await this.prisma.productCategory.findUnique({
          where: { id: catId },
          select: { isActive: true, name_id: true },
        });
        if (cat && !cat.isActive) {
          throw new ApiError(
            `Kategori "${cat.name_id}" sedang nonaktif. Tidak dapat mengaktifkan atau menetapkan produk aktif ke kategori nonaktif.`,
            400,
          );
        }
      }

      const itemCatId =
        updateData.itemCategoryId !== undefined
          ? updateData.itemCategoryId
          : existing.itemCategoryId;
      if (itemCatId) {
        const ic = await this.prisma.itemCategory.findUnique({
          where: { id: itemCatId },
          select: { isActive: true, name: true },
        });
        if (ic && !ic.isActive) {
          throw new ApiError(
            `Item category "${ic.name}" sedang nonaktif. Tidak dapat mengaktifkan atau menetapkan produk aktif ke item category nonaktif.`,
            400,
          );
        }
      }

      const inameId =
        updateData.itemNameId !== undefined
          ? updateData.itemNameId
          : existing.itemNameId;
      if (inameId) {
        const iname = await this.prisma.itemName.findUnique({
          where: { id: inameId },
          select: { isActive: true, name: true },
        });
        if (iname && !iname.isActive) {
          throw new ApiError(
            `Item name "${iname.name}" sedang nonaktif. Tidak dapat mengaktifkan atau menetapkan produk aktif ke item name nonaktif.`,
            400,
          );
        }
      }

      const matId =
        updateData.materialTypeId !== undefined
          ? updateData.materialTypeId
          : existing.materialTypeId;
      if (matId) {
        const mat = await this.prisma.materialType.findUnique({
          where: { id: matId },
          select: { isActive: true, name: true },
        });
        if (mat && !mat.isActive) {
          throw new ApiError(
            `Material "${mat.name}" sedang nonaktif. Tidak dapat mengaktifkan atau menetapkan produk aktif ke material nonaktif.`,
            400,
          );
        }
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        itemCategory: true,
        itemName: true,
        materialType: true,
        images: true,
        videos: true,
        productVariants: true,
        attributeValues: {
          include: {
            attributeValue: {
              include: { attribute: true },
            },
          },
        },
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

  async updateMasterPrice(
    id: string,
    payload: {
      basePrice: number | string;
      activeVendorPriceRecordId?: string | null;
      activePriceFreightMode?: string | null;
      foreignPrice?: number | string | null;
      currencyCode?: string | null;
      exchangeRate?: number | string | null;
      additionalFee?: number | string | null;
      foreignPriceAdjuster?: number | null;
      priceTiers: {
        minQuantity: number;
        maxQuantity?: number | null;
        price: number | string;
      }[];
    },
  ) {
    const {
      basePrice,
      activeVendorPriceRecordId,
      activePriceFreightMode,
      priceTiers,
      foreignPrice,
      currencyCode,
      exchangeRate,
      additionalFee,
      foreignPriceAdjuster,
    } = payload;

    if (priceTiers.length > 0) {
      const sortedTiers = priceTiers.sort(
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

    return await this.prisma.$transaction(async (tx) => {
      // 1. Get the current product details before update to compare basePrice and tiers
      const oldProduct = await tx.product.findUnique({
        where: { id },
        include: {
          priceTiers: true,
          productVariants: {
            include: {
              priceTiers: true,
              attributeValues: true,
            },
          },
          attributeValues: true,
        },
      });

      const oldBasePrice = oldProduct?.basePrice
        ? Number(oldProduct.basePrice)
        : 0;
      const oldTiers = oldProduct?.priceTiers || [];

      const product = await tx.product.update({
        where: { id },
        data: {
          basePrice: basePrice.toString(),
          activeVendorPriceRecordId: activeVendorPriceRecordId || null,
          activePriceFreightMode: activePriceFreightMode || null,
          foreignPrice:
            foreignPrice !== undefined && foreignPrice !== null
              ? foreignPrice.toString()
              : null,
          currencyCode: currencyCode || "IDR",
          exchangeRate:
            exchangeRate !== undefined && exchangeRate !== null
              ? exchangeRate.toString()
              : null,
          additionalFee:
            additionalFee !== undefined && additionalFee !== null
              ? additionalFee.toString()
              : null,
          foreignPriceAdjuster:
            foreignPriceAdjuster !== undefined && foreignPriceAdjuster !== null
              ? Number(foreignPriceAdjuster)
              : 0,
        },
      });

      // Clear existing tiers
      await tx.priceTier.deleteMany({ where: { productId: id } });

      // Insert new tiers
      if (priceTiers.length > 0) {
        await tx.priceTier.createMany({
          data: priceTiers.map((t) => ({
            productId: id,
            minQuantity: t.minQuantity,
            maxQuantity: t.maxQuantity ?? null,
            price: t.price.toString(),
          })),
        });
      }

      // 4. Synchronize product variants
      if (oldProduct && oldProduct.productVariants.length > 0) {
        for (const variant of oldProduct.productVariants) {
          const vPrice = variant.price ? Number(variant.price) : 0;

          // Calculate price modifier for this variant:
          // 1. Try to find attribute-based modifier sum from ProductAttributeValue
          let modifier = 0;
          let hasAttrModifier = false;
          if (variant.attributeValues && oldProduct.attributeValues) {
            const variantAttrValIds = new Set(
              variant.attributeValues.map((av: any) => av.attributeValueId),
            );
            for (const pav of oldProduct.attributeValues) {
              if (
                variantAttrValIds.has(pav.attributeValueId) &&
                pav.priceModifier !== null &&
                pav.priceModifier !== undefined
              ) {
                modifier += Number(pav.priceModifier) || 0;
                hasAttrModifier = true;
              }
            }
          }

          // 2. If no attribute modifier found, use historical diff from oldBasePrice (if oldBasePrice > 0 and vPrice > 0)
          if (!hasAttrModifier && oldBasePrice > 0 && vPrice > 0) {
            modifier = vPrice - oldBasePrice;
          }

          const newVariantPrice = Math.max(0, Number(basePrice) + modifier);

          // Apply variant price update
          await tx.productVariant.update({
            where: { id: variant.id },
            data: { price: newVariantPrice },
          });

          // Apply variant tiers update mirroring product tiers + variant modifier
          await tx.priceTier.deleteMany({ where: { variantId: variant.id } });

          if (priceTiers.length > 0) {
            await tx.priceTier.createMany({
              data: priceTiers.map((t) => ({
                variantId: variant.id,
                minQuantity: t.minQuantity,
                maxQuantity: t.maxQuantity ?? null,
                price: Math.max(0, Number(t.price) + modifier).toString(),
                productId: null,
              })),
            });
          }
        }
      }

      return product;
    });
  }

  // === PRIVATE MATHEMATICAL COGS FORMULA ===
  private calculateCogsAndSellingPrice(params: {
    importType: "BORONGAN" | "RESMI";
    beaMasukPercent?: number;
    ppnPercent?: number;
    pphPercent?: number;
    formECost?: number;
    insurancePercent?: number;
    handlingCost?: number;
    otherCost?: number;
    foreignPrice: number;
    gzDeliveryCost: number;
    exchangeRate: number;
    qtyPcs: number;
    qtyPerCtn: number;
    length: number;
    width: number;
    height: number;
    weight: number;
    seaFreightRate: number;
    airFreightRate: number;
    localFreight: number;
    margin: number;
    sponsorPercent: number;
    roundUpTo?: number;
  }) {
    const {
      importType,
      beaMasukPercent = 0,
      ppnPercent = 11,
      pphPercent = 2.5,
      formECost = 0,
      insurancePercent = 0,
      handlingCost = 0,
      otherCost = 0,
      foreignPrice,
      gzDeliveryCost,
      exchangeRate,
      qtyPcs,
      qtyPerCtn,
      length,
      width,
      height,
      weight,
      seaFreightRate,
      airFreightRate,
      localFreight,
      margin,
      sponsorPercent,
      roundUpTo = 1000,
    } = params;

    const safeQtyPerCtn = Math.max(1, qtyPerCtn || 1);
    const safeQtyPcs = Math.max(1, qtyPcs || safeQtyPerCtn);
    const totalCtn = Math.max(1, Math.ceil(safeQtyPcs / safeQtyPerCtn));

    const cbmPerCtn = (length * width * height) / 1000000;
    const totalCbm = cbmPerCtn * totalCtn;
    const totalSeaCbmAlloc = Math.max(0.1, totalCbm);

    const totalAirWeightAlloc = Math.max(
      totalSeaCbmAlloc,
      (weight + 2) * totalCtn,
    );

    const seaFreightCostPcs =
      importType === "RESMI"
        ? seaFreightRate / safeQtyPcs
        : (totalSeaCbmAlloc * seaFreightRate) / safeQtyPcs;
    const airFreightCostPcs =
      (totalAirWeightAlloc * airFreightRate) / safeQtyPcs;

    const gzDeliveryCostPcs = gzDeliveryCost * exchangeRate;
    const baseCostPcs = foreignPrice * exchangeRate;

    let cogsSea = 0;
    let cogsAir = 0;

    if (importType === "RESMI") {
      const formECostPcs = (formECost * exchangeRate) / safeQtyPcs;
      const insuranceCostPcs = (insurancePercent / 100) * baseCostPcs;

      const cifSeaPcs =
        baseCostPcs +
        gzDeliveryCostPcs +
        formECostPcs +
        seaFreightCostPcs +
        insuranceCostPcs;
      const cifAirPcs =
        baseCostPcs +
        gzDeliveryCostPcs +
        formECostPcs +
        airFreightCostPcs +
        insuranceCostPcs;

      const bmSeaPcs = (beaMasukPercent / 100) * cifSeaPcs;
      const bmAirPcs = (beaMasukPercent / 100) * cifAirPcs;

      const ppnSeaPcs = (ppnPercent / 100) * (cifSeaPcs + bmSeaPcs);
      const ppnAirPcs = (ppnPercent / 100) * (cifAirPcs + bmAirPcs);

      const pphSeaPcs = (pphPercent / 100) * (cifSeaPcs + bmSeaPcs);
      const pphAirPcs = (pphPercent / 100) * (cifAirPcs + bmAirPcs);

      const taxSeaPcs = bmSeaPcs + ppnSeaPcs + pphSeaPcs;
      const taxAirPcs = bmAirPcs + ppnAirPcs + pphAirPcs;

      const handlingCostPcs = handlingCost / safeQtyPcs;
      const otherCostPcs = otherCost / safeQtyPcs;

      cogsSea =
        cifSeaPcs + taxSeaPcs + handlingCostPcs + otherCostPcs + localFreight;
      cogsAir =
        cifAirPcs + taxAirPcs + handlingCostPcs + otherCostPcs + localFreight;
    } else {
      cogsSea =
        baseCostPcs + gzDeliveryCostPcs + seaFreightCostPcs + localFreight;
      cogsAir =
        baseCostPcs + gzDeliveryCostPcs + airFreightCostPcs + localFreight;
    }

    const sponsorMultiplier = 1 + sponsorPercent / 100;
    const rawSellSea = cogsSea * sponsorMultiplier + margin;
    const rawSellAir = cogsAir * sponsorMultiplier + margin;

    const sellPriceSea =
      roundUpTo > 1
        ? Math.ceil(rawSellSea / roundUpTo) * roundUpTo
        : Math.round(rawSellSea);
    const sellPriceAir =
      roundUpTo > 1
        ? Math.ceil(rawSellAir / roundUpTo) * roundUpTo
        : Math.round(rawSellAir);

    return { sellPriceSea, sellPriceAir };
  }

  // === BATCH PREVIEW MASTER PRICE ===
  async previewBatchPrices(data: BatchPriceModifierDTO) {
    const products = await this.prisma.product.findMany({
      where: {
        currencyCode: data.targetCurrency,
        ...(data.productIds &&
          data.productIds.length > 0 && {
            id: { in: data.productIds },
          }),
      },
      include: {
        category: true,
        priceTiers: true,
        activeVendorPriceRecord: {
          include: {
            vendor: true,
          },
        },
      },
    });

    const offsetVal = data.offsetValue || 0;
    const offsetCurr = data.offsetCurrency || "IDR";
    let offsetRate = 1;
    if (offsetCurr !== "IDR") {
      if (offsetCurr === data.targetCurrency) {
        offsetRate = data.newExchangeRate;
      } else {
        try {
          const res = await this.currencyConversion.convertCurrency({
            fromCurrency: offsetCurr,
            toCurrency: "IDR",
            amount: 1,
          });
          offsetRate = res.rate;
        } catch (e) {
          offsetRate = 1;
        }
      }
    }
    const idrOffset = offsetVal * offsetRate;

    const previewItems = products.map((p) => {
      const activeQuote = p.activeVendorPriceRecord;
      const rate =
        p.currencyCode === data.targetCurrency
          ? data.newExchangeRate
          : Number(p.exchangeRate) || 1;
      let basePriceCalculated = Number(p.basePrice) || 0;
      let calculatedTiers: {
        minQuantity: number;
        maxQuantity: number | null;
        price: number;
      }[] = [];

      if (activeQuote) {
        const qtyPerCtn = activeQuote.qtyPerCtn || 1;
        const moqCtn = activeQuote.moqCtn || 1;
        const roundUpToVal = Number((activeQuote as any).roundUpTo) || 1000;

        if (activeQuote.calculationMode === "FIXED") {
          if (p.priceTiers && p.priceTiers.length > 0) {
            // Recalculate using existing saved tiers
            calculatedTiers = p.priceTiers.map((t) => {
              const calc = this.calculateCogsAndSellingPrice({
                importType: activeQuote.importType as "BORONGAN" | "RESMI",
                beaMasukPercent: Number(activeQuote.beaMasukPercent) || 0,
                ppnPercent: Number(activeQuote.ppnPercent) || 0,
                pphPercent: Number(activeQuote.pphPercent) || 0,
                formECost: Number(activeQuote.formECost) || 0,
                insurancePercent: Number(activeQuote.insurancePercent) || 0,
                handlingCost: Number(activeQuote.handlingCost) || 0,
                otherCost: Number(activeQuote.otherCost) || 0,
                foreignPrice: Number(activeQuote.foreignPrice) || 0,
                gzDeliveryCost: Number(activeQuote.gzDeliveryCost) || 0,
                exchangeRate: rate,
                qtyPcs: t.minQuantity,
                qtyPerCtn,
                length: Number(activeQuote.length) || 0,
                width: Number(activeQuote.width) || 0,
                height: Number(activeQuote.height) || 0,
                weight: Number(activeQuote.weight) || 0,
                seaFreightRate: Number(activeQuote.seaFreightRate) || 0,
                airFreightRate: Number(activeQuote.airFreightRate) || 0,
                localFreight: Number(activeQuote.localFreight) || 0,
                margin: Number(activeQuote.margin) || 0,
                sponsorPercent: Number(activeQuote.sponsorPercent) * 100 || 0,
                roundUpTo: roundUpToVal,
              });

              const finalPrice =
                p.activePriceFreightMode === "SEA"
                  ? calc.sellPriceSea
                  : calc.sellPriceAir;
              return {
                minQuantity: t.minQuantity,
                maxQuantity: t.maxQuantity,
                price: finalPrice + idrOffset,
              };
            });
          } else {
            // Generate 5 MOQ steps as tiers (Fallback)
            const baseMoqCtn = Math.max(1, moqCtn || 1);
            calculatedTiers = [0, 1, 2, 3, 4].map((step) => {
              const stepCtn = baseMoqCtn + step;
              const stepPcs = stepCtn * qtyPerCtn;
              const nextStepPcs = (baseMoqCtn + step + 1) * qtyPerCtn;
              const minQuantity = stepPcs;
              const maxQuantity = step < 4 ? nextStepPcs - 1 : null;

              const calc = this.calculateCogsAndSellingPrice({
                importType: activeQuote.importType as "BORONGAN" | "RESMI",
                beaMasukPercent: Number(activeQuote.beaMasukPercent) || 0,
                ppnPercent: Number(activeQuote.ppnPercent) || 0,
                pphPercent: Number(activeQuote.pphPercent) || 0,
                formECost: Number(activeQuote.formECost) || 0,
                insurancePercent: Number(activeQuote.insurancePercent) || 0,
                handlingCost: Number(activeQuote.handlingCost) || 0,
                otherCost: Number(activeQuote.otherCost) || 0,
                foreignPrice: Number(activeQuote.foreignPrice) || 0,
                gzDeliveryCost: Number(activeQuote.gzDeliveryCost) || 0,
                exchangeRate: rate,
                qtyPcs: stepPcs,
                qtyPerCtn,
                length: Number(activeQuote.length) || 0,
                width: Number(activeQuote.width) || 0,
                height: Number(activeQuote.height) || 0,
                weight: Number(activeQuote.weight) || 0,
                seaFreightRate: Number(activeQuote.seaFreightRate) || 0,
                airFreightRate: Number(activeQuote.airFreightRate) || 0,
                localFreight: Number(activeQuote.localFreight) || 0,
                margin: Number(activeQuote.margin) || 0,
                sponsorPercent: Number(activeQuote.sponsorPercent) * 100 || 0,
                roundUpTo: roundUpToVal,
              });

              const finalPrice =
                p.activePriceFreightMode === "SEA"
                  ? calc.sellPriceSea
                  : calc.sellPriceAir;
              return {
                minQuantity,
                maxQuantity,
                price: finalPrice + idrOffset,
              };
            });
          }

          if (calculatedTiers.length > 0) {
            basePriceCalculated = calculatedTiers[0].price;
          }
        } else {
          // Handle VARIABLE mode tiers from activeQuote.tiers
          const quoteTiers = activeQuote.tiers;
          if (
            quoteTiers &&
            Array.isArray(quoteTiers) &&
            quoteTiers.length > 0
          ) {
            const sorted = [...quoteTiers].sort(
              (a: any, b: any) =>
                (Number(a.totalPcs) || 0) - (Number(b.totalPcs) || 0),
            );

            calculatedTiers = sorted.map((item: any, idx: number) => {
              const minQuantity = Number(item.totalPcs) || 1;
              const nextItem = sorted[idx + 1] as any;
              const maxQuantity = nextItem
                ? (Number(nextItem.totalPcs) || 0) - 1
                : null;

              const calc = this.calculateCogsAndSellingPrice({
                importType: activeQuote.importType as "BORONGAN" | "RESMI",
                beaMasukPercent: Number(activeQuote.beaMasukPercent) || 0,
                ppnPercent: Number(activeQuote.ppnPercent) || 0,
                pphPercent: Number(activeQuote.pphPercent) || 0,
                formECost: Number(activeQuote.formECost) || 0,
                insurancePercent: Number(activeQuote.insurancePercent) || 0,
                handlingCost: Number(activeQuote.handlingCost) || 0,
                otherCost: Number(activeQuote.otherCost) || 0,
                foreignPrice: Number(item.pricePcs) || 0,
                gzDeliveryCost:
                  Number(item.gzCost) ||
                  Number(activeQuote.gzDeliveryCost) ||
                  0,
                exchangeRate: rate,
                qtyPcs: minQuantity,
                qtyPerCtn,
                length: Number(activeQuote.length) || 0,
                width: Number(activeQuote.width) || 0,
                height: Number(activeQuote.height) || 0,
                weight: Number(activeQuote.weight) || 0,
                seaFreightRate: Number(activeQuote.seaFreightRate) || 0,
                airFreightRate: Number(activeQuote.airFreightRate) || 0,
                localFreight: Number(activeQuote.localFreight) || 0,
                margin: Number(activeQuote.margin) || 0,
                sponsorPercent: Number(activeQuote.sponsorPercent) * 100 || 0,
                roundUpTo: roundUpToVal,
              });

              const finalPrice =
                p.activePriceFreightMode === "SEA"
                  ? calc.sellPriceSea
                  : calc.sellPriceAir;
              return {
                minQuantity,
                maxQuantity,
                price: finalPrice + idrOffset,
              };
            });

            if (calculatedTiers.length > 0) {
              basePriceCalculated = calculatedTiers[0].price;
            }
          }
        }
      } else {
        // CUSTOM Mode or Local Product
        if (p.currencyCode && p.currencyCode !== "IDR") {
          basePriceCalculated =
            Number(p.foreignPrice) * rate +
            (Number(p.additionalFee) || 0) +
            idrOffset;
        } else {
          basePriceCalculated = (Number(p.basePrice) || 0) + idrOffset;
        }
      }

      const roundUp = p.activeVendorPriceRecord
        ? Number((p.activeVendorPriceRecord as any).roundUpTo) || 1000
        : 1000;
      const finalPriceRounded =
        roundUp > 1
          ? Math.ceil(basePriceCalculated / roundUp) * roundUp
          : Math.round(basePriceCalculated);

      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        categoryName: p.category?.name_id || p.category?.name_en || "-",
        currentPrice: Number(p.basePrice) || 0,
        newPrice: finalPriceRounded,
        difference: finalPriceRounded - (Number(p.basePrice) || 0),
        priceTiers: calculatedTiers.map((t) => {
          const originalTier = p.priceTiers?.find(
            (pt) => pt.minQuantity === t.minQuantity,
          );
          if (originalTier) {
            const oldBase = Number(p.basePrice) || 0;
            const oldTierPrice = Number(originalTier.price) || 0;
            const existingDiscount = Math.max(0, oldBase - oldTierPrice);
            const newTierPrice = Math.max(
              0,
              finalPriceRounded - existingDiscount,
            );
            return {
              minQuantity: t.minQuantity,
              maxQuantity: t.maxQuantity,
              price: newTierPrice,
            };
          }
          return {
            minQuantity: t.minQuantity,
            maxQuantity: t.maxQuantity,
            price:
              roundUp > 1
                ? Math.ceil(t.price / roundUp) * roundUp
                : Math.round(t.price),
          };
        }),
      };
    });

    return {
      summary: {
        totalProducts: products.length,
        targetCurrency: data.targetCurrency,
        newExchangeRate: data.newExchangeRate,
        rupiahOffset: idrOffset,
      },
      previewItems,
    };
  }

  // === BATCH UPDATE MASTER PRICE ===
  async updateBatchPrices(data: BatchPriceModifierDTO) {
    const preview = await this.previewBatchPrices(data);

    await this.prisma.$transaction(async (tx) => {
      for (const item of preview.previewItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            basePrice: item.newPrice.toString(),
            exchangeRate:
              (await tx.product.findUnique({ where: { id: item.productId } }))
                ?.currencyCode === data.targetCurrency
                ? data.newExchangeRate.toString()
                : undefined,
          },
        });

        // Update price tiers if generated/recalculated
        if (item.priceTiers && item.priceTiers.length > 0) {
          await tx.priceTier.deleteMany({
            where: { productId: item.productId },
          });
          await tx.priceTier.createMany({
            data: item.priceTiers.map((t) => ({
              productId: item.productId,
              minQuantity: t.minQuantity,
              maxQuantity: t.maxQuantity,
              price: t.price.toString(),
            })),
          });
        }

        // Synchronize product variants
        const prod = await tx.product.findUnique({
          where: { id: item.productId },
          include: {
            productVariants: {
              include: { attributeValues: true },
            },
            attributeValues: true,
          },
        });

        if (prod && prod.productVariants.length > 0) {
          for (const variant of prod.productVariants) {
            let modifier = 0;
            if (variant.attributeValues && prod.attributeValues) {
              const variantAttrValIds = new Set(
                variant.attributeValues.map((av: any) => av.attributeValueId),
              );
              for (const pav of prod.attributeValues) {
                if (
                  variantAttrValIds.has(pav.attributeValueId) &&
                  pav.priceModifier !== null &&
                  pav.priceModifier !== undefined
                ) {
                  modifier += Number(pav.priceModifier) || 0;
                }
              }
            }

            const newVariantPrice = Math.max(0, item.newPrice + modifier);
            await tx.productVariant.update({
              where: { id: variant.id },
              data: { price: newVariantPrice },
            });

            if (item.priceTiers && item.priceTiers.length > 0) {
              await tx.priceTier.deleteMany({
                where: { variantId: variant.id },
              });
              await tx.priceTier.createMany({
                data: item.priceTiers.map((t) => ({
                  variantId: variant.id,
                  minQuantity: t.minQuantity,
                  maxQuantity: t.maxQuantity,
                  price: Math.max(0, Number(t.price) + modifier).toString(),
                  productId: null,
                })),
              });
            }
          }
        }
      }
    });

    return {
      success: true,
      message: `Successfully updated ${preview.previewItems.length} product prices.`,
    };
  }

  // === ADD IMAGE ===
  async addImage(
    id: string,
    file?: Express.Multer.File,
    metadata?: { isFeatured?: boolean; altText?: string; url?: string },
  ) {
    let secureUrl = "";
    let publicId = "";

    if (file) {
      const upload = await this.cloudinary.upload(file, {
        folder: "products",
        resource_type: "image",
      });
      secureUrl = upload.secure_url;
      publicId = upload.public_id;
    } else if (metadata?.url) {
      secureUrl = metadata.url;
      publicId = `fe_link_${Date.now()}_${Math.random()}`;
    } else {
      throw new ApiError("No image file or URL provided", 400);
    }

    const lastImage = await this.prisma.productImage.findFirst({
      where: { productId: id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const nextOrder = (lastImage?.sortOrder ?? -1) + 1;

    await this.prisma.productImage.create({
      data: {
        productId: id,
        url: secureUrl,
        publicId: publicId,
        isFeatured: metadata?.isFeatured || false,
        altText: metadata?.altText || "Product Image",
        sortOrder: nextOrder,
      },
    });

    return this.getProductById(id);
  }

  // === ADD MULTIPLE IMAGES ===
  async addMultipleImages(
    id: string,
    files: Express.Multer.File[],
    metadataList?: { isFeatured?: boolean; altText?: string }[],
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product) throw new ApiError("Product not found", 404);

    if (!files || files.length === 0) {
      throw new ApiError("No image files provided", 400);
    }

    const lastImage = await this.prisma.productImage.findFirst({
      where: { productId: id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let currentOrder = (lastImage?.sortOrder ?? -1) + 1;

    const uploadedData: {
      productId: string;
      url: string;
      publicId: string;
      isFeatured: boolean;
      altText: string;
      sortOrder: number;
    }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = metadataList?.[i];

      const upload = await this.cloudinary.upload(file, {
        folder: "products",
        resource_type: "image",
      });

      uploadedData.push({
        productId: id,
        url: upload.secure_url,
        publicId: upload.public_id,
        isFeatured: meta?.isFeatured || false,
        altText: meta?.altText || product.name || "Product Image",
        sortOrder: currentOrder++,
      });
    }

    await this.prisma.productImage.createMany({
      data: uploadedData,
    });

    return this.getProductById(id);
  }

  // === DELETE IMAGE ===
  async deleteImage(imageId: string) {
    const img = await this.prisma.productImage.findUnique({
      where: { id: imageId },
      include: { product: true },
    });
    if (!img) throw new ApiError("Image not found", 404);
    const productId = img.productId;
    await this.cloudinary.remove(img.url);
    if (img.colorMaskUrl) {
      try {
        await this.cloudinary.remove(img.colorMaskUrl);
      } catch (err) {
        console.warn(
          "⚠️ Failed to delete color mask from Cloudinary on deleteImage:",
          err,
        );
      }
    }

    if (img.product) {
      const updateData: any = {};
      if (img.product.mockupFrontImageId === imageId) {
        updateData.mockupFrontImageId = null;
      }
      if (img.product.mockupBackImageId === imageId) {
        updateData.mockupBackImageId = null;
      }
      if (Object.keys(updateData).length > 0) {
        await this.prisma.product.update({
          where: { id: productId },
          data: updateData,
        });
      }
    }

    await this.prisma.productImage.delete({ where: { id: imageId } });

    const updatedProduct = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        images: true,
        videos: true,
      },
    });

    if (!updatedProduct)
      throw new ApiError("Product not found after update", 404);

    return updatedProduct;
  }

  // === UPLOAD COLOR MASK ===
  async uploadColorMask(imageId: string, file?: Express.Multer.File) {
    if (!file) {
      throw new ApiError("No color mask file provided", 400);
    }

    // 1. Get the existing product image
    const existingImage = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });
    if (!existingImage) {
      throw new ApiError("Product image not found", 404);
    }

    // 2. If it already has an existing color mask in Cloudinary, delete it first
    if (existingImage.colorMaskUrl) {
      try {
        await this.cloudinary.remove(existingImage.colorMaskUrl);
      } catch (err) {
        console.warn(
          "⚠️ Failed to delete old color mask from Cloudinary:",
          err,
        );
      }
    }

    // 3. Upload new color mask to Cloudinary
    const uploadResult = await this.cloudinary.upload(file, {
      folder: "products/color-masks",
      resource_type: "image",
    });

    // 4. Update the ProductImage record
    const updatedImage = await this.prisma.productImage.update({
      where: { id: imageId },
      data: {
        colorMaskUrl: uploadResult.secure_url,
        colorMaskPublicId: uploadResult.public_id,
      },
    });

    return updatedImage;
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

    const lastVideo = await this.prisma.productVideo.findFirst({
      where: { productId: id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const nextOrder = (lastVideo?.sortOrder ?? -1) + 1;

    await this.prisma.productVideo.create({
      data: {
        productId: id,
        url: data.url,
        publicId: data.publicId || `manual_${Date.now()}`,
        title: data.title || product.name,
        altText: data.altText || product.name,
        isFeatured: data.isFeatured || false,
        sortOrder: nextOrder,
      },
    });

    return this.getProductById(id);
  }

  // === REORDER MEDIA (IMAGES OR VIDEOS) ===
  async reorderMedia(
    productId: string,
    type: "image" | "video",
    orderedIds: string[],
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new ApiError("Product not found", 404);

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      throw new ApiError("orderedIds must be a non-empty array of IDs", 400);
    }

    await this.prisma.$transaction(async (tx) => {
      if (type === "image") {
        for (let i = 0; i < orderedIds.length; i++) {
          await tx.productImage.update({
            where: { id: orderedIds[i], productId },
            data: { sortOrder: i },
          });
        }
      } else if (type === "video") {
        for (let i = 0; i < orderedIds.length; i++) {
          await tx.productVideo.update({
            where: { id: orderedIds[i], productId },
            data: { sortOrder: i },
          });
        }
      } else {
        throw new ApiError(
          "Invalid media type. Must be 'image' or 'video'",
          400,
        );
      }
    });

    return this.getProductById(productId);
  }

  // === DELETE VIDEO ===
  async deleteVideo(videoId: string) {
    const vid = await this.prisma.productVideo.findUnique({
      where: { id: videoId },
    });
    if (!vid) throw new ApiError("Video not found", 404);
    const productId = vid.productId;
    await this.cloudinary.remove(vid.url);
    await this.prisma.productVideo.delete({ where: { id: videoId } });

    const updatedProduct = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        images: true,
        videos: true,
      },
    });

    if (!updatedProduct)
      throw new ApiError("Product not found after update", 404);

    return updatedProduct;
  }

  // == DELETE PRODUCT (SMART SAFE DELETE) ===
  async deleteProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!product) {
      throw new ApiError("Produk tidak ditemukan.", 404);
    }

    // 1. Check transaction references across orders, quotations, invoices, etc.
    const [
      orderCount,
      quotationCount,
      purchaseCount,
      invoiceCount,
      replacementCount,
      webOrderCount,
      cashflowCount,
    ] = await Promise.all([
      this.prisma.orderProduct.count({ where: { productId: id } }),
      this.prisma.quotationItem.count({ where: { productId: id } }),
      this.prisma.purchaseOrderItem.count({ where: { productId: id } }),
      this.prisma.invoiceItem.count({ where: { productId: id } }),
      this.prisma.replacementOrderProduct.count({ where: { productId: id } }),
      this.prisma.webOrderItem.count({ where: { productId: id } }),
      this.prisma.cashflowRevenue.count({ where: { productId: id } }),
    ]);

    const totalTransactions =
      orderCount +
      quotationCount +
      purchaseCount +
      invoiceCount +
      replacementCount +
      webOrderCount +
      cashflowCount;

    if (totalTransactions > 0) {
      const details: string[] = [];
      if (orderCount > 0) details.push(`${orderCount} pesanan`);
      if (quotationCount > 0) details.push(`${quotationCount} quotation`);
      if (purchaseCount > 0) details.push(`${purchaseCount} purchase order`);
      if (invoiceCount > 0) details.push(`${invoiceCount} invoice`);
      if (replacementCount > 0)
        details.push(`${replacementCount} replacement order`);
      if (webOrderCount > 0) details.push(`${webOrderCount} web order`);
      if (cashflowCount > 0) details.push(`${cashflowCount} cashflow revenue`);

      throw new ApiError(
        `Produk "${product.name}" tidak dapat dihapus karena sudah memiliki riwayat transaksi (${details.join(", ")}). Silakan nonaktifkan status produk untuk menyembunyikannya dari katalog.`,
        400,
      );
    }

    // 2. Collect image/video public IDs for background Cloudinary cleanup
    const [images, videos] = await Promise.all([
      this.prisma.productImage.findMany({
        where: { productId: id },
        select: { publicId: true, colorMaskPublicId: true },
      }),
      this.prisma.productVideo.findMany({
        where: { productId: id },
        select: { publicId: true },
      }),
    ]);

    // 3. Atomic database deletion
    await this.prisma.$transaction(async (tx) => {
      // Clear active price reference and disconnect tags on product first
      await tx.product.update({
        where: { id },
        data: {
          activeVendorPriceRecordId: null,
          tags: { set: [] },
        },
      });

      // Cart items
      await tx.cartItem.deleteMany({ where: { productId: id } });

      // Product-level price tiers
      await tx.priceTier.deleteMany({ where: { productId: id } });

      // Variants & variant children
      const variants = await tx.productVariant.findMany({
        where: { productId: id },
        select: { id: true },
      });
      const variantIds = variants.map((v) => v.id);

      if (variantIds.length > 0) {
        await tx.priceTier.deleteMany({
          where: { variantId: { in: variantIds } },
        });
        await tx.productVariantAttributeValue.deleteMany({
          where: { variantId: { in: variantIds } },
        });
        await tx.productVariantImage.deleteMany({
          where: { variantId: { in: variantIds } },
        });
        await tx.productVariant.deleteMany({
          where: { id: { in: variantIds } },
        });
      }

      // Mockup areas & images
      const imgList = await tx.productImage.findMany({
        where: { productId: id },
        select: { id: true },
      });
      const imgIds = imgList.map((img) => img.id);
      if (imgIds.length > 0) {
        await tx.productImageMockupArea.deleteMany({
          where: { productImageId: { in: imgIds } },
        });
        await tx.productImage.deleteMany({ where: { id: { in: imgIds } } });
      }

      // Videos
      await tx.productVideo.deleteMany({ where: { productId: id } });

      // Attribute values link
      await tx.productAttributeValue.deleteMany({ where: { productId: id } });

      // SEO
      await tx.productSEO.deleteMany({ where: { productId: id } });

      // Articles relation
      await tx.articleProduct.deleteMany({ where: { productId: id } });

      // Vendor price records
      await tx.vendorPriceRecord.deleteMany({ where: { productId: id } });

      // Product-specific attributes if any
      const customAttributes = await tx.attribute.findMany({
        where: { productId: id },
        select: { id: true },
      });
      const customAttrIds = customAttributes.map((a) => a.id);
      if (customAttrIds.length > 0) {
        await tx.attributeValue.deleteMany({
          where: { attributeId: { in: customAttrIds } },
        });
        await tx.attribute.deleteMany({
          where: { id: { in: customAttrIds } },
        });
      }

      // Core Product
      await tx.product.delete({ where: { id } });
    });

    // 4. Background media cleanup (Fail-safe)
    (async () => {
      for (const img of images) {
        if (img.publicId) {
          try {
            await this.cloudinary.delete(img.publicId);
          } catch (err) {
            console.warn(
              `[DeleteProduct] Failed to delete image ${img.publicId}:`,
              err,
            );
          }
        }
        if (img.colorMaskPublicId) {
          try {
            await this.cloudinary.delete(img.colorMaskPublicId);
          } catch (err) {
            console.warn(
              `[DeleteProduct] Failed to delete mask ${img.colorMaskPublicId}:`,
              err,
            );
          }
        }
      }
      for (const vid of videos) {
        if (vid.publicId) {
          try {
            await this.cloudinary.delete(vid.publicId);
          } catch (err) {
            console.warn(
              `[DeleteProduct] Failed to delete video ${vid.publicId}:`,
              err,
            );
          }
        }
      }
    })().catch((err) =>
      console.error("[DeleteProduct] Background cleanup error:", err),
    );

    return {
      success: true,
      message: `Produk "${product.name}" berhasil dihapus permanen.`,
      id,
    };
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
            priceTiers:
              v.priceTiers && v.priceTiers.length > 0
                ? {
                    createMany: {
                      data: v.priceTiers.map((tier) => ({
                        minQuantity: tier.minQuantity,
                        maxQuantity: tier.maxQuantity ?? null,
                        price: tier.price.toString(),
                        productId: null,
                      })),
                    },
                  }
                : undefined,
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

        await this.prisma.priceTier.deleteMany({
          where: { variantId: variantId },
        });

        // 2. Buat price tier baru jika ada
        if (v.priceTiers && v.priceTiers.length > 0) {
          await this.prisma.priceTier.createMany({
            data: v.priceTiers.map((tier) => ({
              variantId: variantId,
              minQuantity: tier.minQuantity,
              maxQuantity: tier.maxQuantity ?? null,
              price: tier.price.toString(),
              productId: null,
            })),
          });
        }
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
    const {
      productId,
      attributeValueIds,
      priceModifiers = {},
      weights = {},
      widths = {},
      heights = {},
      lengths = {},
      orderedAttributeIds,
      orderedAttributeValueIds,
    } = dto;

    // 1. Delete all existing attribute associations for this product
    await this.prisma.productAttributeValue.deleteMany({
      where: { productId },
    });

    // 2. Re-create all attribute associations with price modifiers
    if (attributeValueIds.length > 0) {
      const attributeValues = await this.prisma.attributeValue.findMany({
        where: { id: { in: attributeValueIds } },
        select: { id: true, attributeId: true },
      });

      const insertData = attributeValues.map((av) => {
        const modifier =
          priceModifiers[av.id] !== undefined
            ? Number(priceModifiers[av.id])
            : 0;
        const weightVal =
          weights[av.id] !== undefined && weights[av.id] !== null
            ? Number(weights[av.id])
            : null;
        const widthVal =
          widths[av.id] !== undefined && widths[av.id] !== null
            ? Number(widths[av.id])
            : null;
        const heightVal =
          heights[av.id] !== undefined && heights[av.id] !== null
            ? Number(heights[av.id])
            : null;
        const lengthVal =
          lengths[av.id] !== undefined && lengths[av.id] !== null
            ? Number(lengths[av.id])
            : null;

        return {
          productId,
          attributeValueId: av.id,
          attributeId: av.attributeId,
          priceModifier: modifier,
          weight: weightVal,
          width: widthVal,
          height: heightVal,
          length: lengthVal,
        };
      });

      await this.prisma.productAttributeValue.createMany({
        data: insertData,
        skipDuplicates: true,
      });
    }

    // 3. Update position of attributes based on order in payload
    if (orderedAttributeIds && orderedAttributeIds.length > 0) {
      for (let i = 0; i < orderedAttributeIds.length; i++) {
        const attrId = orderedAttributeIds[i];
        await this.prisma.attribute.updateMany({
          where: { id: attrId },
          data: { position: i },
        });
      }
    }

    // 4. Update position of attribute values based on order in payload
    if (orderedAttributeValueIds && orderedAttributeValueIds.length > 0) {
      for (let i = 0; i < orderedAttributeValueIds.length; i++) {
        const valId = orderedAttributeValueIds[i];
        await this.prisma.attributeValue.updateMany({
          where: { id: valId },
          data: { position: i },
        });
      }
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

  // === GET PRODUCT BY ID (INCLUDE MEDIA, VARIANTS, ATTRIBUTES, HIERARCHY) ===
  async getProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        itemCategory: true,
        itemName: true,
        activeVendorPriceRecord: {
          include: {
            vendor: true,
          },
        },
        vendorPrices: {
          include: {
            vendor: true,
          },
        },

        // Price Tiers untuk Produk Utama
        priceTiers: {
          orderBy: { minQuantity: "asc" },
        },

        images: {
          orderBy: { sortOrder: "asc" },
          include: {
            mockupAreas: true,
          },
        },
        videos: {
          orderBy: { sortOrder: "asc" },
        },
        tags: true,
        materialType: true,

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
            //  TAMBAHAN BARU: Mengambil Price Tiers khusus Varian
            priceTiers: {
              orderBy: { minQuantity: "asc" },
            },

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

    // Sort product-level attributeValues in memory by attribute position and value position
    if (product.attributeValues) {
      product.attributeValues.sort((a: any, b: any) => {
        const aAttrPos = a.attributeValue?.attribute?.position ?? 0;
        const bAttrPos = b.attributeValue?.attribute?.position ?? 0;
        if (aAttrPos !== bAttrPos) return aAttrPos - bAttrPos;

        const aValPos = a.attributeValue?.position ?? 0;
        const bValPos = b.attributeValue?.position ?? 0;
        return aValPos - bValPos;
      });
    }

    // Sort variant-level attributeValues in memory by attribute position and value position
    if (product.productVariants) {
      product.productVariants.forEach((v: any) => {
        if (v.attributeValues) {
          v.attributeValues.sort((a: any, b: any) => {
            const aAttrPos = a.attributeValue?.attribute?.position ?? 0;
            const bAttrPos = b.attributeValue?.attribute?.position ?? 0;
            if (aAttrPos !== bAttrPos) return aAttrPos - bAttrPos;

            const aValPos = a.attributeValue?.position ?? 0;
            const bValPos = b.attributeValue?.position ?? 0;
            return aValPos - bValPos;
          });
        }
      });
    }

    return this.injectLegacyMockupArea(product);
  }

  // === GET ALL PRODUCTS (WITH PAGINATION, SEARCH, FILTER, & DATE RANGE) ===
  async getAllProducts(query: {
    page?: number;
    take?: number;
    search?: string;
    categoryId?: string;
    isCustom?: boolean | string;
    startDate?: string;
    endDate?: string;
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

    // === Filter Is Custom ===
    if (query.isCustom !== undefined) {
      if (typeof query.isCustom === "string") {
        where.isCustom = query.isCustom === "true";
      } else {
        where.isCustom = query.isCustom;
      }
    }

    // === Filter Rentang Tanggal (BARU) ===
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        // gte = Greater Than or Equal (>=)
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        // lte = Less Than or Equal (<=)
        // Kita set ke akhir hari (23:59:59) agar data di tanggal tersebut tetap terbawa
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // === Pagination & Query Data ===
    const count = await this.prisma.product.count({ where });
    const data = await this.prisma.product.findMany({
      where,
      skip: (Number(query.page || 1) - 1) * Number(query.take || 10),
      take: Number(query.take || 10),
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        priceTiers: {
          orderBy: { minQuantity: "asc" },
        },
        activeVendorPriceRecord: {
          include: {
            vendor: true,
          },
        },
        vendorPrices: {
          include: {
            vendor: true,
          },
        },
        images: {
          orderBy: { sortOrder: "asc" },
          include: {
            mockupAreas: true,
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

  // === GET ALL PRODUCTS FOR ORDER (DENGAN URUTAN BERDASARKAN POSITION & CUSTOM STATUS) ===
  async getAllProductsForOrder(query?: {
    categoryId?: string;
    isCustom?: boolean | string;
  }) {
    try {
      const where: any = {};

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
              maxQuantity: true,
              price: true,
            },
            orderBy: { minQuantity: "asc" },
          },

          // --- AMBIL ATRIBUT PRODUK BESERTA POSITION & ATTR TYPE ---
          attributeValues: {
            select: {
              id: true,
              priceModifier: true,
              attributeValue: {
                select: {
                  id: true,
                  value: true,
                  position: true, // Ambil posisi nilai atribut
                  attribute: {
                    select: {
                      id: true,
                      name: true,
                      type: true,
                      position: true, // Ambil posisi atribut utama
                      //  TAMBAHAN BARU: Ambil relasi isCustom dari AttributeType
                      attrType: {
                        select: {
                          isCustom: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },

          // --- PRODUCT VARIANTS ---
          productVariants: {
            select: {
              id: true,
              variantName: true,
              price: true,
              sku: true,
              stock: true,
              attributeValues: {
                select: {
                  attributeValue: {
                    select: {
                      id: true,
                      value: true,
                      position: true,
                      attribute: {
                        select: {
                          id: true,
                          name: true,
                          position: true,
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: { variantName: "asc" },
          },
        },
      });

      // === Map Response & Urutkan Berdasarkan Position di JavaScript ===
      return products.map((p) => {
        const groupedAttributes: Record<string, any> = {};

        p.attributeValues.forEach((pav) => {
          const attr = pav.attributeValue.attribute;
          const attrName = attr.name;

          if (!groupedAttributes[attrName]) {
            groupedAttributes[attrName] = {
              attributeId: attr.id,
              attributeName: attrName,
              attributeType: attr.type,
              isCustom: attr.attrType?.isCustom || false,
              position: attr.position,
              values: [],
            };
          }

          groupedAttributes[attrName].values.push({
            valueId: pav.attributeValue.id,
            value: pav.attributeValue.value,
            position: pav.attributeValue.position,
            priceModifier: pav.priceModifier ? Number(pav.priceModifier) : 0,
            productAttributeValueId: pav.id,
          });
        });

        //  Urutkan Atribut Utama Berdasarkan 'position'
        const sortedAttributes = Object.values(groupedAttributes).sort(
          (a: any, b: any) => a.position - b.position,
        );

        //  Urutkan Nilai (Values) di Dalam Masing-masing Atribut Berdasarkan 'position'
        sortedAttributes.forEach((attr: any) => {
          attr.values.sort((a: any, b: any) => a.position - b.position);
        });

        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          basePrice: p.basePrice ? Number(p.basePrice) : 0,
          isCustom: p.isCustom,
          category: p.category
            ? { id: p.category.id, name: p.category.name_id }
            : null,
          priceTiers: p.priceTiers.map((tier) => ({
            id: tier.id,
            minQuantity: tier.minQuantity,
            maxQuantity: tier.maxQuantity,
            price: Number(tier.price),
          })),

          availableAttributes: sortedAttributes,

          productVariants: p.productVariants.map((v) => ({
            id: v.id,
            variantName: v.variantName || "Unnamed Variant",
            sku: v.sku,
            price: v.price ? Number(v.price) : 0,
            stock: v.stock,
            combinationIds: v.attributeValues.map(
              (vav: any) => vav.attributeValue.id,
            ),
            attributesDescription: v.attributeValues
              .map(
                (vav: any) =>
                  `${vav.attributeValue.attribute.name}: ${vav.attributeValue.value}`,
              )
              .join(", "),
          })),
        };
      });
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

    // 2. Handle color mask deletion if requested
    if (data.deleteColorMask === true && existingImage.colorMaskUrl) {
      try {
        await this.cloudinary.remove(existingImage.colorMaskUrl);
      } catch (err) {
        console.error("Failed to delete color mask from Cloudinary:", err);
      }
    }

    // 3. Update Image
    const updatedImage = await this.prisma.productImage.update({
      where: { id: imageId },
      data: {
        altText: data.altText ?? undefined,
        mockupSideName:
          data.mockupSideName !== undefined ? data.mockupSideName : undefined,
        isFeatured: data.isFeatured ?? undefined,
        attributeValueId:
          data.attributeValueId !== undefined
            ? data.attributeValueId
            : undefined,
        printPositionValueId:
          data.printPositionValueId !== undefined
            ? data.printPositionValueId
            : undefined,
        printSideValueId:
          data.printSideValueId !== undefined
            ? data.printSideValueId
            : undefined,
        ...(data.deleteColorMask === true
          ? { colorMaskUrl: null, colorMaskPublicId: null }
          : {}),
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

  // === UPSERT PRODUCT SEO (AUTO TRANSLATE BILINGUAL) ===
  async upsertProductSEO(productId: string, data: ProductSeoDTO) {
    // 1. Validasi: Pastikan Produknya Ada
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new ApiError(`Product with ID ${productId} not found`, 404);
    }

    // 2. Ambil data SEO lama untuk membandingkan apakah ada perubahan
    const existingSeo = await this.prisma.productSEO.findUnique({
      where: { productId },
    });

    // 3. Fungsi pembantu untuk menerjemahkan otomatis secara cerdas
    const getEnValue = async (
      newIdText?: string,
      newEnText?: string,
      oldIdText?: string | null,
      oldEnText?: string | null,
    ) => {
      // Jika admin sudah mengisi manual versi Inggris, utamakan inputan admin
      if (newEnText && newEnText.trim() !== "") {
        return newEnText;
      }

      // Jika teks Indonesia diisi DAN (teksnya berbeda dengan yang lama ATAU data baru)
      if (newIdText && newIdText !== oldIdText) {
        try {
          const res = await translate(newIdText, { to: "en" });
          return res.text;
        } catch (error) {
          console.error(
            "Gagal menerjemahkan teks, memakai teks asli sebagai fallback:",
            error,
          );
          return newIdText; // Fallback ke teks Indonesia jika API error
        }
      }

      // Jika teks Indonesia tidak berubah dan admin tidak mengisi teks Inggris baru,
      // kita pertahankan teks Inggris yang sudah ada di database sebelumnya.
      return oldEnText || undefined;
    };

    // 4. Proses semua terjemahan secara paralel (bersamaan) agar lebih cepat
    // Kita tidak menerjemahkan canonicalUrl dan structuredData karena itu berupa URL dan JSON
    const [
      metaTitleEn,
      metaDescriptionEn,
      keywordsEn,
      ogTitleEn,
      ogDescriptionEn,
    ] = await Promise.all([
      getEnValue(
        data.metaTitleId,
        data.metaTitleEn,
        existingSeo?.metaTitleId,
        existingSeo?.metaTitleEn,
      ),
      getEnValue(
        data.metaDescriptionId,
        data.metaDescriptionEn,
        existingSeo?.metaDescriptionId,
        existingSeo?.metaDescriptionEn,
      ),
      getEnValue(
        data.keywordsId,
        data.keywordsEn,
        existingSeo?.keywordsId,
        existingSeo?.keywordsEn,
      ),
      getEnValue(
        data.ogTitleId,
        data.ogTitleEn,
        existingSeo?.ogTitleId,
        existingSeo?.ogTitleEn,
      ),
      getEnValue(
        data.ogDescriptionId,
        data.ogDescriptionEn,
        existingSeo?.ogDescriptionId,
        existingSeo?.ogDescriptionEn,
      ),
    ]);

    // 5. Simpan ke database menggunakan Upsert
    const seoData = await this.prisma.productSEO.upsert({
      where: {
        productId: productId,
      },
      create: {
        productId: productId,
        // Data Bahasa Indonesia
        metaTitleId: data.metaTitleId,
        metaDescriptionId: data.metaDescriptionId,
        keywordsId: data.keywordsId,
        canonicalUrlId: data.canonicalUrlId,
        ogTitleId: data.ogTitleId,
        ogDescriptionId: data.ogDescriptionId,
        structuredDataId: data.structuredDataId,

        // Data Bahasa Inggris (Hasil Translate atau Input Manual)
        metaTitleEn: metaTitleEn,
        metaDescriptionEn: metaDescriptionEn,
        keywordsEn: keywordsEn,
        canonicalUrlEn: data.canonicalUrlEn,
        ogTitleEn: ogTitleEn,
        ogDescriptionEn: ogDescriptionEn,
        structuredDataEn: data.structuredDataEn,

        // Data Universal
        ogImage: data.ogImage,
      },
      update: {
        // Data Bahasa Indonesia
        metaTitleId: data.metaTitleId,
        metaDescriptionId: data.metaDescriptionId,
        keywordsId: data.keywordsId,
        canonicalUrlId: data.canonicalUrlId,
        ogTitleId: data.ogTitleId,
        ogDescriptionId: data.ogDescriptionId,
        structuredDataId: data.structuredDataId,

        // Data Bahasa Inggris (Hasil Translate atau Input Manual)
        metaTitleEn: metaTitleEn,
        metaDescriptionEn: metaDescriptionEn,
        keywordsEn: keywordsEn,
        canonicalUrlEn: data.canonicalUrlEn,
        ogTitleEn: ogTitleEn,
        ogDescriptionEn: ogDescriptionEn,
        structuredDataEn: data.structuredDataEn,

        // Data Universal
        ogImage: data.ogImage,
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

  // === GENERATE SKU OTOMATIS BERBASIS HIRARKI & MATERIAL ===
  async generateSku(params: {
    productName: string;
    categoryId: string;
    itemCategoryId: string;
    itemNameId: string;
    materialTypeId: string;
  }): Promise<string> {
    const {
      productName,
      categoryId,
      itemCategoryId,
      itemNameId,
      materialTypeId,
    } = params;

    // 1. Validasi Input
    if (
      !productName ||
      !categoryId ||
      !itemCategoryId ||
      !itemNameId ||
      !materialTypeId
    ) {
      throw new ApiError(
        "Semua pilihan kategori dan material wajib diisi untuk membuat SKU",
        400,
      );
    }

    // 2. Ambil semua kode hirarki secara bersamaan (Parallel Fetch)
    const [cat, itemCat, itemName, mat] = await Promise.all([
      this.prisma.productCategory.findUnique({
        where: { id: categoryId },
        select: { code: true },
      }),
      this.prisma.itemCategory.findUnique({
        where: { id: itemCategoryId },
        select: { code: true },
      }),
      this.prisma.itemName.findUnique({
        where: { id: itemNameId },
        select: { code: true },
      }),
      this.prisma.materialType.findUnique({
        where: { id: materialTypeId },
        select: { code: true },
      }),
    ]);

    // Validasi apakah kode tersedia
    if (!cat?.code || !itemCat?.code || !itemName?.code || !mat?.code) {
      throw new ApiError(
        "Salah satu master data belum memiliki 'code'. Harap update master data terlebih dahulu.",
        400,
      );
    }

    // 3. Buat prefix dari nama produk (Logika 2 huruf awal)
    const words = productName.trim().split(/\s+/);
    let namePrefix = "";
    if (words.length >= 2) {
      namePrefix = (words[0][0] + words[1][0]).toUpperCase();
    } else if (words.length === 1 && words[0].length >= 2) {
      namePrefix = words[0].substring(0, 2).toUpperCase();
    } else {
      namePrefix = (words[0][0] + "X").toUpperCase();
    }

    // 4. Rangkai Base Prefix: CAT-ITEMCAT-NAME-MAT-PREFIX
    const basePrefix = `${cat.code}-${itemCat.code}-${itemName.code}-${mat.code}-${namePrefix}`;

    // 5. Cari nomor urut terakhir di database berdasarkan basePrefix
    const lastProduct = await this.prisma.product.findFirst({
      where: {
        sku: {
          startsWith: basePrefix,
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
      // Mengambil bagian nomor urut setelah prefix
      const numericPart = lastProduct.sku.replace(basePrefix, "");
      const lastNumber = parseInt(numericPart, 10);

      if (!isNaN(lastNumber)) {
        nextSequence = lastNumber + 1;
      }
    }

    // 6. Hasil Akhir (Contoh: ELE-LAP-MAC-ALU-MA0001)
    const newSku = `${basePrefix}${nextSequence.toString().padStart(4, "0")}`;

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

  // === GET ALL PRODUCTS PUBLIC (DENGAN PENYESUAIAN HARGA LUAR NEGERI & PRICE TIERS) ===
  async getAllProductsPublic(query: {
    page?: number;
    take?: number;
    search?: string;
    categoryId?: string;
    category?: string;
    itemCategory?: string;
    itemName?: string;
    isCustom?: boolean | string;
    minPrice?: string;
    maxPrice?: string;
    attributes?: string;
    availability?: string;
    sort?: string;
    targetCurrency?: string;
    lang?: string;
  }) {
    const where: any = {
      isActive: true,
      category: { isActive: true },
    };
    const lang = query.lang || "id";

    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { name_en: { contains: query.search } },
        { sku: { contains: query.search } },
      ];
    }

    if (query.isCustom !== undefined) {
      where.isCustom =
        typeof query.isCustom === "string"
          ? query.isCustom === "true"
          : query.isCustom;
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    } else if (query.category && query.category !== "all") {
      where.category = {
        isActive: true,
        OR: [
          { name_id: { equals: query.category } },
          { name_en: { equals: query.category } },
          { slug: { equals: query.category } },
        ],
      };
    }

    if (query.itemCategory && query.itemCategory !== "all") {
      where.itemCategory = {
        isActive: true,
        OR: [
          { name: { equals: query.itemCategory } },
          { slug: { equals: query.itemCategory } },
        ],
      };
    }

    if (query.itemName && query.itemName !== "all") {
      where.itemName = {
        isActive: true,
        OR: [
          { name: { equals: query.itemName } },
          { slug: { equals: query.itemName } },
        ],
      };
    }

    if (query.attributes) {
      try {
        const parsedAttrs = JSON.parse(query.attributes);
        for (const [attrName, attrValue] of Object.entries(parsedAttrs)) {
          if (attrValue && attrValue !== "all") {
            if (!where.AND) where.AND = [];
            where.AND.push({
              OR: [
                {
                  attributeValues: {
                    some: {
                      attributeValue: {
                        value: String(attrValue),
                        attribute: { name: attrName },
                      },
                    },
                  },
                },
                {
                  productVariants: {
                    some: {
                      attributeValues: {
                        some: {
                          attributeValue: {
                            value: String(attrValue),
                            attribute: { name: attrName },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            });
          }
        }
      } catch (error) {
        console.error("Gagal membaca filter attributes:", error);
      }
    }

    if (query.minPrice || query.maxPrice) {
      where.basePrice = {};
      if (query.minPrice) where.basePrice.gte = Number(query.minPrice);
      if (query.maxPrice) where.basePrice.lte = Number(query.maxPrice);
    }

    if (query.availability && query.availability !== "all") {
      if (query.availability === "in_stock") where.stock = { gt: 0 };
      else if (query.availability === "out_of_stock")
        where.stock = { equals: 0 };
    }

    let orderBy: any = { createdAt: "desc" };
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
          break;
      }
    }

    const page = Number(query.page || 1);
    const take = Number(query.take || 6);

    const [count, rawData, appSetting] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * take,
        take: take,
        orderBy,
        include: {
          category: true,
          itemCategory: true,
          itemName: true,
          // ✨ UBAH 1: Memprioritaskan gambar dengan isFeatured = true
          images: {
            take: 1,
            orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
          },
          orderProducts: { select: { quantity: true } },
          priceTiers: { orderBy: { minQuantity: "asc" } },
        },
      }),
      this.prisma.appSetting.findFirst(),
    ]);

    let conversionRate = 1;
    let finalCurrency = "IDR";

    if (query.targetCurrency && query.targetCurrency !== "IDR") {
      try {
        const conversionResult = await this.currencyConversion.convertCurrency({
          fromCurrency: "IDR",
          toCurrency: query.targetCurrency,
          amount: 1,
        });

        conversionRate = conversionResult.rate;
        finalCurrency = query.targetCurrency;
      } catch (error) {
        console.error(
          "Gagal mengambil nilai tukar, harga akan fallback ke IDR",
          error,
        );
      }
    }

    const globalAdjuster = appSetting?.globalForeignPriceAdjuster || 0;
    const isForeignTransaction = finalCurrency !== "IDR";

    const formattedData = rawData.map((product) => {
      const totalSold = product.orderProducts.reduce(
        (sum, order) => sum + (order.quantity || 1),
        0,
      );

      let productName =
        lang === "en"
          ? product.name_en || product.name || "Unnamed Product"
          : product.name || product.name_en || "Produk Tanpa Nama";
      let categoryName = product.category?.name_id || "Uncategorized";
      if (lang === "en" && product.category?.name_en) {
        categoryName = product.category.name_en;
      }

      //  LOGIKA HARGA DAN MINIMUM PEMBELIAN
      const basePriceValue = Number(product.basePrice);
      let calculatedRegularPrice = basePriceValue;
      let calculatedBulkPrice = basePriceValue;
      let minOrderQty = 1;

      // Cek tier harga terendah (index 0 karena sudah di-order by minQuantity asc)
      if (product.priceTiers && product.priceTiers.length > 0) {
        const lowestTier = product.priceTiers[0];
        calculatedBulkPrice = Number(lowestTier.price);
        minOrderQty = lowestTier.minQuantity;
      }

      // Hitung kenaikan harga jika transaksi luar negeri
      if (isForeignTransaction) {
        const productAdjuster = product.foreignPriceAdjuster ?? 0;
        const activeAdjuster =
          productAdjuster !== 0 ? productAdjuster : globalAdjuster;

        calculatedRegularPrice =
          calculatedRegularPrice +
          calculatedRegularPrice * (activeAdjuster / 100);
        calculatedBulkPrice =
          calculatedBulkPrice + calculatedBulkPrice * (activeAdjuster / 100);
      }

      // ✨ UBAH 2: Menghapus fallback /images/placeholder.jpg dan mengembalikan null
      const imageUrl = product.images.length > 0 ? product.images[0].url : null;

      return {
        id: product.id,
        name: productName,
        image: imageUrl,

        regularPrice: parseFloat(
          (calculatedRegularPrice * conversionRate).toFixed(2),
        ),
        bulkPrice: parseFloat(
          (calculatedBulkPrice * conversionRate).toFixed(2),
        ),
        minOrder: minOrderQty,

        currencyCode: finalCurrency,
        sold: totalSold,
        isCustom: product.isCustom,
        categoryId: product.categoryId,
        categoryName: categoryName,
        itemCategoryName: product.itemCategory?.name || null,
        itemNameString: product.itemName?.name || null,
        slug: product.slug,
      };
    });

    const meta = this.pagination.generateMeta({ count, page, take });

    return { data: formattedData, meta };
  }

  // === GET BEST SELLER PRODUCTS (CLIENT HOME PAGE) ===
  async getBestSellerProducts(
    targetCurrency: string = "IDR",
    lang: string = "id",
  ) {
    try {
      const topSelling = await this.prisma.orderProduct.groupBy({
        by: ["productId"],
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 6,
      });

      const productIds = topSelling.map((item) => item.productId);
      let rawProducts: any[] = [];

      if (productIds.length > 0) {
        rawProducts = await this.prisma.product.findMany({
          where: {
            id: { in: productIds },
            isActive: true,
            category: { isActive: true },
          },
          include: {
            category: true,
            images: { take: 1, orderBy: { isFeatured: "desc" } },
            priceTiers: { orderBy: { minQuantity: "asc" } },
            orderProducts: { select: { quantity: true } },
          },
        });
      }

      // FALLBACK: Jika belum ada penjualan
      if (rawProducts.length === 0) {
        rawProducts = await this.prisma.product.findMany({
          where: { isActive: true, category: { isActive: true } },
          take: 6,
          orderBy: { createdAt: "desc" },
          include: {
            category: true,
            images: { take: 1, orderBy: { isFeatured: "desc" } },
            priceTiers: { orderBy: { minQuantity: "asc" } },
            orderProducts: { select: { quantity: true } },
          },
        });
      }

      // ✨ AMBIL APP SETTING UNTUK GLOBAL ADJUSTER
      const appSetting = await this.prisma.appSetting.findFirst();
      const globalAdjuster = appSetting?.globalForeignPriceAdjuster || 0;

      // ✨ LOGIKA KONVERSI MATA UANG
      let conversionRate = 1;
      let finalCurrency = "IDR";

      if (targetCurrency && targetCurrency !== "IDR") {
        try {
          const conversionResult =
            await this.currencyConversion.convertCurrency({
              fromCurrency: "IDR",
              toCurrency: targetCurrency,
              amount: 1,
            });
          conversionRate = conversionResult.rate;
          finalCurrency = targetCurrency;
        } catch (error) {
          console.error(
            "Gagal mengambil nilai tukar, harga fallback ke IDR",
            error,
          );
        }
      }

      const isForeignTransaction = finalCurrency !== "IDR";

      const formattedData = rawProducts.map((product) => {
        const totalSold = product.orderProducts.reduce(
          (sum: number, order: any) => sum + (order.quantity || 1),
          0,
        );

        // ✨ PENYESUAIAN BAHASA (Nama & Kategori)
        let productName = product.name;
        if (lang === "en") {
          productName = product.name_en || product.name || "Unnamed Product";
        }

        let categoryName = product.category?.name_id || "";
        if (lang === "en" && product.category?.name_en) {
          categoryName = product.category.name_en;
        }

        // ✨ PENYESUAIAN HARGA & TIER
        const basePriceValue = Number(product.basePrice);
        let calculatedRegularPrice = basePriceValue;
        let calculatedBulkPrice = basePriceValue;
        let minOrder = 1;

        if (product.priceTiers && product.priceTiers.length > 0) {
          const cheapestTier = [...product.priceTiers].sort(
            (a, b) => Number(a.price) - Number(b.price),
          )[0];
          calculatedBulkPrice = Number(cheapestTier.price);
          minOrder = cheapestTier.minQuantity;
        }

        // ✨ TERAPKAN ADJUSTER JIKA TRANSAKSI LUAR NEGERI
        if (isForeignTransaction) {
          const productAdjuster = product.foreignPriceAdjuster ?? 0;
          const activeAdjuster =
            productAdjuster !== 0 ? productAdjuster : globalAdjuster;

          calculatedRegularPrice =
            calculatedRegularPrice +
            calculatedRegularPrice * (activeAdjuster / 100);
          calculatedBulkPrice =
            calculatedBulkPrice + calculatedBulkPrice * (activeAdjuster / 100);
        }

        const imageUrl =
          product.images.length > 0 ? product.images[0].url : null;

        return {
          id: product.id,
          name: productName,
          slug: product.slug,
          image: imageUrl,
          // Kalikan dengan conversion rate dan bulatkan ke 2 desimal
          regularPrice: parseFloat(
            (calculatedRegularPrice * conversionRate).toFixed(2),
          ),
          bulkPrice: parseFloat(
            (calculatedBulkPrice * conversionRate).toFixed(2),
          ),
          minOrder: minOrder,
          sold: totalSold,
          isCustom: product.isCustom,
          categoryName: categoryName,
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

  // === GET PRODUCT BY SLUG (PUBLIC / CLIENT PAGE) ===
  async getProductBySlugPublic(
    slug: string,
    targetCurrency: string = "IDR",
    lang: string = "id",
  ) {
    try {
      const product = await this.prisma.product.findUnique({
        where: { slug },
        include: {
          materialType: true,
          category: true,
          images: {
            orderBy: { sortOrder: "asc" },
            include: { mockupAreas: true },
          },
          videos: { orderBy: { sortOrder: "asc" } },
          productVariants: {
            include: {
              images: { orderBy: { isFeatured: "desc" } },
              priceTiers: { orderBy: { minQuantity: "asc" } },
              attributeValues: {
                include: {
                  attributeValue: { include: { attribute: true } },
                },
              },
            },
          },
          priceTiers: { orderBy: { minQuantity: "asc" } },
          orderProducts: { select: { quantity: true } },
          attributeValues: {
            include: { attributeValue: true, attribute: true },
          },
        },
      });
      if (
        !product ||
        !product.isActive ||
        (product.category && !product.category.isActive)
      ) {
        throw new Error("Product not found");
      }
      // If materialType is inactive, don't expose it to client
      if (product.materialType && !product.materialType.isActive) {
        (product as any).materialType = null;
      }
      this.injectLegacyMockupArea(product);
      let conversionRate = 1;
      if (targetCurrency && targetCurrency !== "IDR") {
        try {
          const conversionResult =
            await this.currencyConversion.convertCurrency({
              fromCurrency: "IDR",
              toCurrency: targetCurrency,
              amount: 1,
            });
          conversionRate = conversionResult.rate;
          const appSetting = await this.prisma.appSetting.findFirst();
          const globalAdjuster = appSetting?.globalForeignPriceAdjuster
            ? Number(appSetting.globalForeignPriceAdjuster)
            : 0;
          const productAdjuster =
            product.foreignPriceAdjuster !== null &&
            product.foreignPriceAdjuster !== undefined
              ? Number(product.foreignPriceAdjuster)
              : 0;
          const effectiveAdjuster =
            productAdjuster > 0 ? productAdjuster : globalAdjuster;
          if (effectiveAdjuster > 0) {
            conversionRate = conversionRate * (1 + effectiveAdjuster / 100);
          }
          console.log(
            `[CURRENCY ADJUSTMENT] Slug: ${slug}, Target: ${targetCurrency}`,
          );
          console.log(` - Original rate: ${conversionResult.rate}`);
          console.log(` - Global adjuster: ${globalAdjuster}%`);
          console.log(` - Product adjuster: ${productAdjuster}%`);
          console.log(` - Effective adjuster: ${effectiveAdjuster}%`);
          console.log(` - Final rate (adjusted): ${conversionRate}`);
        } catch (error) {
          console.error(
            "Gagal mengambil nilai tukar untuk detail produk, fallback ke IDR",
            error,
          );
        }
      }
      let productName = product.name;
      if (lang === "en") {
        productName = product.name_en || product.name || "Unnamed Product";
      } else {
        productName = product.name || product.name_en || "Produk Tanpa Nama";
      }
      const productDescription =
        lang === "en" && product.description_en
          ? product.description_en
          : product.description;
      const totalSold = product.orderProducts.reduce(
        (sum, order) => sum + (order.quantity || 1),
        0,
      );
      const combinedMedia: any[] = [];
      if (product.images && product.images.length > 0) {
        product.images.forEach((img) => {
          combinedMedia.push({
            id: img.id,
            type: "image",
            url: img.url,
            mockupAreas: img.mockupAreas || [],
            altText: img.altText,
            mockupSideName: img.mockupSideName,
            printPositionValueId: img.printPositionValueId,
            attributeValueId: img.attributeValueId,
            printSideValueId: img.printSideValueId,
            isFeatured: img.isFeatured || false,
            colorMaskUrl: img.colorMaskUrl,
            sortOrder: img.sortOrder ?? 0,
          });
        });
      }
      if (product.videos && product.videos.length > 0) {
        product.videos.forEach((vid) => {
          combinedMedia.push({
            id: vid.id,
            type: "video",
            url: vid.url,
            isFeatured: vid.isFeatured || false,
            sortOrder: vid.sortOrder ?? 0,
          });
        });
      }
      if (combinedMedia.length === 0) {
        combinedMedia.push({
          id: "placeholder",
          type: "image",
          url: "/images/placeholder.jpg",
          mockupAreas: [],
        });
      }
      const formattedVariants = product.productVariants.map((v) => {
        const vWeight = v.weight ?? product.weight;
        const vWidth = v.width ?? product.width;
        const vHeight = v.height ?? product.height;
        const vLength = v.length ?? product.length;
        const vDimensionParts = [vLength, vWidth, vHeight].filter(
          (val) => val !== null && val !== undefined,
        );
        const vDimensionsString =
          vDimensionParts.length > 0
            ? `${vDimensionParts.join(" x ")} cm`
            : "-";
        const attributes = v.attributeValues
          .map((av) => ({
            name: av.attributeValue.attribute?.name || "",
            value: av.attributeValue.value || "",
            attributeValueId: av.attributeValueId,
            attributePosition: av.attributeValue.attribute?.position ?? 0,
            valuePosition: av.attributeValue.position ?? 0,
            type: av.attributeValue.attribute?.type || "TEXT",
            parentValueId: av.attributeValue.attribute?.parentValueId || null,
          }))
          .sort((a, b) =>
            a.attributePosition !== b.attributePosition
              ? a.attributePosition - b.attributePosition
              : a.valuePosition - b.valuePosition,
          );
        const rawVariantPrice = v.price ? Number(v.price) : null;
        const convertedVariantPrice =
          rawVariantPrice !== null
            ? parseFloat((rawVariantPrice * conversionRate).toFixed(2))
            : null;

        const formattedVariantTiers = (v.priceTiers || []).map((tier) => {
          let label = "";
          if (tier.maxQuantity) {
            label = `${tier.minQuantity} - ${tier.maxQuantity} pcs`;
          } else {
            label = `≥ ${tier.minQuantity} pcs`;
          }

          const convertedTierPrice = parseFloat(
            (Number(tier.price) * conversionRate).toFixed(2),
          );

          return {
            minQty: tier.minQuantity,
            maxQty: tier.maxQuantity,
            pricePerPcs: convertedTierPrice,
            label: label,
          };
        });

        return {
          id: v.id,
          name: v.variantName || v.sku,
          price: convertedVariantPrice,
          sku: v.sku,
          stock: v.stock || 0,
          rawWeight: vWeight,
          width: vWidth,
          height: vHeight,
          length: vLength,
          weightString: vWeight ? `${vWeight} gram` : "-",
          dimensionsString: vDimensionsString,
          attributes,
          priceTiers: formattedVariantTiers,
          images: v.images.map((img) => ({
            id: img.id,
            type: "image" as const,
            url: img.url,
            mockupAreas: [],
            isFeatured: img.isFeatured || false,
          })),
        };
      });
      const dimensionParts = [
        product.length,
        product.width,
        product.height,
      ].filter((val) => val !== null && val !== undefined);
      const dimensionsString =
        dimensionParts.length > 0 ? `${dimensionParts.join(" x ")} cm` : "-";
      let formattedTiers = product.priceTiers.map((tier) => {
        let label = "";
        if (tier.maxQuantity) {
          label = `${tier.minQuantity} - ${tier.maxQuantity} pcs`;
        } else {
          label = `≥ ${tier.minQuantity} pcs`;
        }
        const convertedTierPrice = parseFloat(
          (Number(tier.price) * conversionRate).toFixed(2),
        );
        return {
          minQty: tier.minQuantity,
          maxQty: tier.maxQuantity,
          pricePerPcs: convertedTierPrice,
          label: label,
        };
      });
      const convertedBasePrice = parseFloat(
        (Number(product.basePrice) * conversionRate).toFixed(2),
      );
      if (formattedTiers.length === 0) {
        formattedTiers.push({
          minQty: 1,
          maxQty: null,
          pricePerPcs: convertedBasePrice,
          label: "1+ pcs",
        });
      }
      const attributeValuesFormatted = await Promise.all(
        product.attributeValues.map(async (av) => {
          let attributeName = av.attribute?.name || "";
          let attributeValue = av.attributeValue?.value || "";
          if (lang === "en") {
            try {
              const [nameTranslated, valueTranslated] = await Promise.all([
                attributeName
                  ? translate(attributeName, { to: "en" }).then(
                      (res) => res.text,
                    )
                  : Promise.resolve(attributeName),
                attributeValue
                  ? translate(attributeValue, { to: "en" }).then(
                      (res) => res.text,
                    )
                  : Promise.resolve(attributeValue),
              ]);
              attributeName = nameTranslated;
              attributeValue = valueTranslated;
            } catch (error) {
              console.error(
                `Failed to translate attribute (${av.attributeId}):`,
                error,
              );
            }
          }
          return {
            id: av.id,
            attributeId: av.attributeId,
            attributeValueId: av.attributeValueId,
            priceModifier: av.priceModifier
              ? parseFloat(
                  (Number(av.priceModifier) * conversionRate).toFixed(2),
                )
              : 0,
            weight: av.weight ? Number(av.weight) : null,
            width: av.width ? Number(av.width) : null,
            height: av.height ? Number(av.height) : null,
            length: av.length ? Number(av.length) : null,
            value: attributeValue,
            attributeName: attributeName,
            attributeType: av.attribute?.type || "TEXT",
            attributePosition: av.attribute?.position ?? 0,
            valuePosition: av.attributeValue?.position ?? 0,
            parentValueId: av.attribute?.parentValueId || null,
          };
        }),
      );
      const attributeValuesSorted = attributeValuesFormatted
        .sort((a, b) =>
          a.attributePosition !== b.attributePosition
            ? a.attributePosition - b.attributePosition
            : a.valuePosition - b.valuePosition,
        )
        .map(({ attributePosition, valuePosition, ...rest }) => rest);
      return {
        id: product.id,
        name: productName,
        sku: product.sku,
        slug: product.slug,
        basePrice: convertedBasePrice,
        currencyCode: targetCurrency,
        foreignPriceAdjuster: product.foreignPriceAdjuster || 0,
        category:
          lang === "en" && product.category?.name_en
            ? product.category.name_en
            : product.category?.name_id || "Uncategorized",
        sold: totalSold,
        media: combinedMedia,
        variants: formattedVariants,
        priceTiers: formattedTiers,
        description: productDescription || "",
        weight: product.weight ? `${product.weight} gram` : "-",
        dimensions: dimensionsString,
        rawWeight: product.weight,
        width: product.width,
        height: product.height,
        length: product.length,
        materialType: product.materialType?.name || "-",
        stock: product.isCustom
          ? formattedVariants.reduce((a, b) => a + b.stock, 0)
          : product.stock,
        isCustom: product.isCustom,
        isMadeByOrder: product.isMadeByOrder,
        whatsappNumber: "6281234567890",
        accessories: [],
        mockupAreaX: product.mockupAreaX,
        mockupAreaY: product.mockupAreaY,
        mockupAreaWidth: product.mockupAreaWidth,
        mockupAreaHeight: product.mockupAreaHeight,
        isMultiFace: product.isMultiFace,
        mockupFrontImageId: product.mockupFrontImageId,
        mockupBackImageId: product.mockupBackImageId,
        colorMockupTrigger: product.colorMockupTrigger,
        attributeValues: attributeValuesSorted,
      };
    } catch (error) {
      console.error(`❌ Error fetching product by slug (${slug}):`, error);
      throw error;
    }
  }

  // === GET RELATED PRODUCTS (PUBLIC) ===
  async getRelatedProducts(slug: string) {
    try {
      const targetProduct = await this.prisma.product.findUnique({
        where: { slug },
        select: { id: true, categoryId: true },
      });

      if (!targetProduct) {
        throw new Error("Product not found");
      }

      // 2. Ambil produk lain di kategori yang sama dan berstatus AKTIF
      const relatedRaw = await this.prisma.product.findMany({
        where: {
          categoryId: targetProduct.categoryId,
          id: { not: targetProduct.id },
          isActive: true, // ✨ PERUBAHAN: Hanya ambil produk yang statusnya aktif
        },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          images: {
            take: 1,
            orderBy: { isFeatured: "desc" },
          },
          priceTiers: {
            orderBy: { minQuantity: "asc" },
          },
        },
      });

      // 3. Mapping data agar sesuai dengan format frontend (Product Type)
      const formattedRelated = relatedRaw.map((p) => {
        let bulkPrice = Number(p.basePrice);
        if (p.priceTiers && p.priceTiers.length > 0) {
          const cheapestTier = [...p.priceTiers].sort(
            (a, b) => Number(a.price) - Number(b.price),
          )[0];
          bulkPrice = Number(cheapestTier.price);
        }

        // Jika gambar ada ambil URL-nya, jika tidak ada kembalikan null
        const imageUrl = p.images.length > 0 ? p.images[0].url : null;

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          image: imageUrl, // Akan bernilai null jika kosong
          bulkPrice: bulkPrice,
          regularPrice: Number(p.basePrice),
        };
      });

      return formattedRelated;
    } catch (error) {
      console.error(`❌ Error fetching related products for (${slug}):`, error);
      throw error;
    }
  }

  async getProductFilterOptions(lang: string = "id") {
    const categories = await this.prisma.productCategory.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name_id: true,
        name_en: true,
        slug: true,
        itemCategories: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            slug: true,
            itemNames: {
              where: { isActive: true },
              select: { id: true, name: true, slug: true },
              orderBy: { name: "asc" },
            },
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name_id: "asc" },
    });

    const attributes = await this.prisma.attribute.findMany({
      include: {
        values: { select: { id: true, value: true } },
      },
    });

    return {
      categories: categories.map((c) => {
        const finalCategoryName =
          lang === "en" && c.name_en ? c.name_en : c.name_id;

        return {
          label: finalCategoryName,
          value: c.slug,
          id: c.id,
          itemCategories: c.itemCategories.map((ic) => ({
            label: ic.name,
            value: ic.slug,
            id: ic.id,
            itemNames: ic.itemNames.map((inm) => ({
              label: inm.name,
              value: inm.slug,
              id: inm.id,
            })),
          })),
        };
      }),
      attributes: attributes.map((attr) => ({
        name: attr.name,
        options: attr.values.map((v) => ({ label: v.value, value: v.value })),
      })),
    };
  }

  async syncMockupAreas(imageId: string, data: { mockupAreas: any[] }) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Verify that the image exists
      const image = await tx.productImage.findUnique({
        where: { id: imageId },
        include: {
          product: {
            include: {
              images: {
                orderBy: { isFeatured: "desc" },
              },
            },
          },
        },
      });

      if (!image) {
        throw new ApiError("Product image not found", 404);
      }

      // 2. Delete existing mockup areas for this image
      await tx.productImageMockupArea.deleteMany({
        where: { productImageId: imageId },
      });

      // 3. Create new mockup areas
      if (data.mockupAreas && data.mockupAreas.length > 0) {
        await tx.productImageMockupArea.createMany({
          data: data.mockupAreas.map((area: any) => ({
            productImageId: imageId,
            x: area.x,
            y: area.y,
            width: area.width,
            height: area.height,
            label: area.label,
            description: area.description || null,
            physicalWidth: area.physicalWidth ?? null,
            physicalHeight: area.physicalHeight ?? null,
            unit: area.unit ?? "cm",
            rotation: area.rotation ?? 0,
          })),
        });
      }

      // 4. Retrieve updated mockup areas of all product images to find the featured one
      const productImages = await tx.productImage.findMany({
        where: { productId: image.productId },
        include: { mockupAreas: true },
        orderBy: { isFeatured: "desc" },
      });

      // Find the first image with mockup areas (preferring featured image)
      const featuredImg =
        productImages.find(
          (img) => img.isFeatured && img.mockupAreas.length > 0,
        ) || productImages.find((img) => img.mockupAreas.length > 0);

      const firstArea = featuredImg?.mockupAreas?.[0];

      // 5. Update legacy fields on Product
      await tx.product.update({
        where: { id: image.productId },
        data: {
          mockupAreaX: firstArea ? firstArea.x : null,
          mockupAreaY: firstArea ? firstArea.y : null,
          mockupAreaWidth: firstArea ? firstArea.width : null,
          mockupAreaHeight: firstArea ? firstArea.height : null,
        },
      });

      // Return the updated list of mockup areas for this image
      return tx.productImageMockupArea.findMany({
        where: { productImageId: imageId },
        orderBy: { createdAt: "asc" },
      });
    });
  }

  /**
   * Helper untuk menerjemahkan nama produk ke bahasa Inggris:
   * Menjaga Item Name (brand/series prefix) tetap utuh apa adanya,
   * dan hanya menerjemahkan deskripsi produknya (suffix).
   */
  public async translateProductNameWithItemName(
    productName: string,
    itemNameId?: string | null,
    cachedItemName?: string | null,
  ): Promise<string | null> {
    if (!productName || !productName.trim()) return null;

    let prefix = "";
    let textToTranslate = productName.trim();

    try {
      let itemNameString = cachedItemName?.trim() || "";
      if (!itemNameString && itemNameId) {
        const itemData = await this.prisma.itemName.findUnique({
          where: { id: itemNameId },
          select: { name: true },
        });
        if (itemData?.name) {
          itemNameString = itemData.name.trim();
        }
      }

      if (itemNameString) {
        const escapedItem = itemNameString.replace(
          /[.*+?^${}()|[\]\\\/]/g,
          "\\$&",
        );
        const regex = new RegExp(
          `^${escapedItem}(?:\\s*[-–:]?\\s+|\\s*$)`,
          "i",
        );

        if (regex.test(textToTranslate)) {
          prefix = itemNameString;
          textToTranslate = textToTranslate.replace(regex, "").trim();
        }
      }

      if (textToTranslate) {
        const res = await translate(textToTranslate, { to: "en" });
        const translatedSuffix = res.text?.trim() || textToTranslate;
        return prefix ? `${prefix} ${translatedSuffix}` : translatedSuffix;
      }

      return prefix || productName;
    } catch (error) {
      console.warn("⚠️ Gagal melakukan auto-translate nama produk:", error);
      return null;
    }
  }

  /**
   * Helper untuk menerjemahkan deskripsi produk ke bahasa Inggris
   */
  public async translateProductDescription(
    description?: string | null,
  ): Promise<string | null> {
    if (!description || !description.trim()) return null;
    try {
      const res = await translate(description, { to: "en" });
      return res.text?.trim() || null;
    } catch (error) {
      console.warn(
        "⚠️ Gagal melakukan auto-translate deskripsi produk:",
        error,
      );
      return null;
    }
  }

  private injectLegacyMockupArea(product: any) {
    if (!product) return product;

    if (product.mockupAreaX === null || product.mockupAreaX === undefined) {
      if (product.images && product.images.length > 0) {
        const featuredImg =
          product.images.find((img: any) => img.isFeatured) ||
          product.images[0];

        if (
          featuredImg &&
          featuredImg.mockupAreas &&
          featuredImg.mockupAreas.length > 0
        ) {
          const firstArea = featuredImg.mockupAreas[0];
          product.mockupAreaX = firstArea.x;
          product.mockupAreaY = firstArea.y;
          product.mockupAreaWidth = firstArea.width;
          product.mockupAreaHeight = firstArea.height;
        }
      }
    }
    return product;
  }
}
