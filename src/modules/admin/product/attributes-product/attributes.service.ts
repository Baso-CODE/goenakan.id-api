import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { translateWithDeepL } from "../../../../utils/deepl-translate";
import { SlugService } from "../../../../utils/genereateSlug";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateAttributeDTO } from "./dto/createAttributes.dto";
import { UpdateAttributeDTO } from "./dto/updateAttributes.dto";

export interface AttributeExportQuery {
  startDate?: string;
  endDate?: string;
  search?: string;
}
@injectable()
export class AttributeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // =====================================================
  // PREPARE DEEPL TRANSLATION BEFORE TRANSACTION
  // =====================================================
  private async prepareAttributeTranslations(data: any): Promise<any> {
    const result = { ...data };

    // 1. Translate nama atribut
    const manualNameEn = data.name_en?.trim();

    if (manualNameEn) {
      result.name_en = manualNameEn;
    } else if (data.name?.trim()) {
      try {
        result.name_en =
          (await translateWithDeepL(data.name.trim())).trim() || null;
      } catch (error) {
        console.warn("Gagal menerjemahkan nama atribut:", data.name, error);
        result.name_en = null;
      }
    }

    // 2. Translate seluruh nilai atribut
    if (Array.isArray(data.values)) {
      result.values = [];

      for (const value of data.values) {
        const translatedValue = { ...value };

        const manualValueEn = value.value_en?.trim();

        if (manualValueEn) {
          translatedValue.value_en = manualValueEn;
        } else if (value.value?.trim()) {
          try {
            translatedValue.value_en =
              (await translateWithDeepL(value.value.trim())).trim() || null;
          } catch (error) {
            console.warn(
              "Gagal menerjemahkan nilai atribut:",
              value.value,
              error,
            );
            translatedValue.value_en = null;
          }
        }

        // 3. Translate subattribute secara rekursif
        if (Array.isArray(value.subAttributes)) {
          translatedValue.subAttributes = [];

          for (const subAttr of value.subAttributes) {
            translatedValue.subAttributes.push(
              await this.prepareAttributeTranslations(subAttr),
            );
          }
        }

        result.values.push(translatedValue);
      }
    }

    return result;
  }

  // === GET ALL ATTRIBUTES (WITH PAGINATION + SEARCH) ===
  async getAllAttributes(query: {
    page?: number;
    take?: number;
    search?: string;
    productId?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      if (query.productId && query.productId !== "undefined") {
        where.OR = [{ productId: null }, { productId: query.productId }];
      }

      // Search by name
      if (query.search) {
        where.name = {
          contains: query.search,
        };
      }

      const count = await this.prisma.attribute.count({ where });

      const data = await this.prisma.attribute.findMany({
        where,
        skip,
        take,
        include: {
          values: {
            orderBy: { position: "asc" },
          },
          product: {
            select: { name: true },
          },
          parentValue: {
            select: {
              id: true,
              value: true,
              attribute: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      });

      const meta = this.pagination.generateMeta({
        count,
        page,
        take,
      });

      return { data, meta };
    } catch (error) {
      console.error("❌ Error in Get All Attributes:", error);
      throw new Error("Failed to fetch attributes. Check server log.");
    }
  }

  // ====================================================================
  // CREATE ATTRIBUTE - DEEPL AUTO TRANSLATE + NESTED HIERARCHY
  // ====================================================================
  async createAttribute(data: CreateAttributeDTO) {
    // Translate seluruh struktur sebelum transaksi Prisma dimulai.
    const translatedData = await this.prepareAttributeTranslations(data);

    return this.prisma.$transaction(
      async (tx) => {
        return this.createAttributeRecursive(translatedData, null, tx);
      },
      {
        timeout: 30000,
      },
    );
  }

  // ====================================================================
  // CREATE ATTRIBUTE RECURSIVELY - SAVE ENGLISH FIELDS
  // ====================================================================
  private async createAttributeRecursive(
    data: any,
    parentValueId: string | null,
    tx: any,
  ): Promise<any> {
    // =====================================================
    // 1. GENERATE ATTRIBUTE SLUG
    // =====================================================

    let generatedSlug = this.slug.create(data.name);

    if (data.productId) {
      const product = await tx.product.findUnique({
        where: { id: data.productId },
        select: { slug: true },
      });

      if (product) {
        generatedSlug = `${generatedSlug}-${product.slug}`;
      }
    }

    // =====================================================
    // 2. ENSURE UNIQUE SLUG
    // =====================================================

    let finalSlug = generatedSlug;
    let counter = 0;

    while (
      await tx.attribute.findUnique({
        where: { slug: finalSlug },
        select: { id: true },
      })
    ) {
      counter++;
      finalSlug = `${generatedSlug}-${counter}`;
    }

    // =====================================================
    // 3. CREATE ATTRIBUTE - ID & EN
    // =====================================================

    const attribute = await tx.attribute.create({
      data: {
        name: data.name,
        name_en: data.name_en?.trim() || null,

        slug: finalSlug,
        productId: data.productId || null,
        type: data.type || "TEXT",
        parentValueId: parentValueId || null,

        ...(data.position !== undefined && {
          position: data.position,
        }),
      },
    });

    // =====================================================
    // 4. CREATE ATTRIBUTE VALUES - ID & EN
    // =====================================================

    if (Array.isArray(data.values) && data.values.length > 0) {
      for (let index = 0; index < data.values.length; index++) {
        const value = data.values[index];

        const attrVal = await tx.attributeValue.create({
          data: {
            value: value.value,
            value_en: value.value_en?.trim() || null,

            position: value.position ?? index,
            attributeId: attribute.id,
          },
        });

        // =================================================
        // 5. CREATE NESTED SUBATTRIBUTES RECURSIVELY
        // =================================================

        if (
          Array.isArray(value.subAttributes) &&
          value.subAttributes.length > 0
        ) {
          for (const subAttr of value.subAttributes) {
            await this.createAttributeRecursive(subAttr, attrVal.id, tx);
          }
        }
      }
    }

    // =====================================================
    // 6. RETURN CREATED ATTRIBUTE
    // =====================================================

    return tx.attribute.findUnique({
      where: { id: attribute.id },
      include: {
        values: {
          orderBy: { position: "asc" },
        },
        parentValue: {
          select: {
            id: true,
            value: true,
            attribute: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }
  // === CLONE ATTRIBUTE ===
  async cloneAttribute(sourceId: string, targetProductId: string) {
    const source = await this.prisma.attribute.findUnique({
      where: { id: sourceId },
      include: { values: true },
    });
    if (!source) {
      throw new ApiError("Source attribute not found", 404);
    }

    const product = await this.prisma.product.findUnique({
      where: { id: targetProductId },
      select: { slug: true },
    });
    if (!product) {
      throw new ApiError("Target product not found", 404);
    }

    const baseSlug = this.slug.create(source.name);
    const generatedSlug = `${baseSlug}-${product.slug}`;

    // Check duplicate slug
    const existing = await this.prisma.attribute.findUnique({
      where: { slug: generatedSlug },
      include: {
        values: {
          orderBy: { position: "asc" },
        },
      },
    });
    if (existing) {
      return existing; // already cloned / exists
    }

    const cloned = await this.prisma.attribute.create({
      data: {
        name: source.name,
        slug: generatedSlug,
        productId: targetProductId,
        type: source.type,
        position: source.position,
        parentValueId: source.parentValueId,
        values: {
          createMany: {
            data: source.values.map((v) => ({
              value: v.value,
              position: v.position,
            })),
          },
        },
      },
      include: {
        values: {
          orderBy: { position: "asc" },
        },
      },
    });

    return cloned;
  }

  // === GET ATTRIBUTE BY ID (RECURSIVE DETAILS) ===
  async getAttributeById(id: string) {
    const attribute = await this.getAttributeByIdRecursive(id);
    if (!attribute) {
      throw new ApiError("Attribute not found", 404);
    }
    return attribute;
  }

  private async getAttributeByIdRecursive(
    id: string,
    tx: any = this.prisma,
  ): Promise<any> {
    const attribute = await tx.attribute.findUnique({
      where: { id },
      include: {
        values: {
          orderBy: { position: "asc" },
        },
        parentValue: {
          select: {
            id: true,
            value: true,
            attribute: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!attribute) return null;

    const valuesWithSub = [];
    for (const val of attribute.values) {
      const subAttrs = await tx.attribute.findMany({
        where: { parentValueId: val.id },
        orderBy: { position: "asc" },
      });

      const processedSubAttrs = [];
      for (const subAttr of subAttrs) {
        const fullSubAttr = await this.getAttributeByIdRecursive(
          subAttr.id,
          tx,
        );
        if (fullSubAttr) {
          processedSubAttrs.push(fullSubAttr);
        }
      }

      valuesWithSub.push({
        ...val,
        subAttributes: processedSubAttrs,
      });
    }

    return {
      ...attribute,
      values: valuesWithSub,
    };
  }

  // UPDATE ATTRIBUTE - DEEPL + RECURSIVE
  // =====================================================

  async updateAttribute(id: string, data: UpdateAttributeDTO) {
    // Terjemahkan seluruh atribut, values,
    // dan subattributes sebelum membuka transaksi.
    const preparedData = await this.prepareUpdateAttributeTranslations(
      data,
      id,
    );

    return this.prisma.$transaction(
      async (tx) => {
        await this.updateAttributeRecursive(id, preparedData, tx);

        return this.getAttributeByIdRecursive(id, tx);
      },
      {
        timeout: 30000,
      },
    );
  }

  // =====================================================
  // UPDATE ATTRIBUTE RECURSIVELY
  // =====================================================

  private async updateAttributeRecursive(id: string, data: any, tx: any) {
    const existing = await tx.attribute.findUnique({
      where: { id },
      include: { values: true },
    });

    if (!existing) {
      throw new ApiError("Attribute not found", 404);
    }

    // =====================================================
    // 1. PREPARE SLUG
    // =====================================================

    const nameChanged = data.name !== undefined && data.name !== existing.name;

    const newSlug =
      nameChanged && data.name ? this.slug.create(data.name) : existing.slug;

    if (newSlug !== existing.slug) {
      const duplicateSlug = await tx.attribute.findUnique({
        where: { slug: newSlug },
      });

      if (duplicateSlug && duplicateSlug.id !== id) {
        throw new ApiError("Slug already exists", 400);
      }
    }

    // =====================================================
    // 2. UPDATE ATTRIBUTE
    // =====================================================

    await tx.attribute.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,

        ...(data.name_en !== undefined && {
          name_en: data.name_en,
        }),

        slug: newSlug,

        position: data.position ?? existing.position,

        type: data.type ?? existing.type,

        parentValueId:
          data.parentValueId !== undefined
            ? data.parentValueId || null
            : existing.parentValueId,
      },
    });

    // =====================================================
    // 3. PROCESS ATTRIBUTE VALUES
    // =====================================================

    if (Array.isArray(data.values)) {
      for (const val of data.values) {
        // ===============================================
        // DELETE EXISTING VALUE
        // ===============================================

        if (val.deleted && val.id) {
          await this.deleteAttributeValueRelationsRecursive(val.id, tx);

          await tx.attributeValue.delete({
            where: { id: val.id },
          });

          continue;
        }

        // ===============================================
        // UPDATE EXISTING VALUE
        // ===============================================

        if (val.id && !val.deleted) {
          await tx.attributeValue.update({
            where: { id: val.id },
            data: {
              ...(val.value !== undefined && {
                value: val.value,
              }),

              ...(val.value_en !== undefined && {
                value_en: val.value_en,
              }),

              ...(val.position !== undefined && {
                position: val.position,
              }),
            },
          });

          // Process subattributes
          if (Array.isArray(val.subAttributes)) {
            for (const subAttr of val.subAttributes) {
              if (subAttr.deleted && subAttr.id) {
                await this.deleteAttributeRelationsRecursive(subAttr.id, tx);

                await tx.attribute.delete({
                  where: { id: subAttr.id },
                });
              } else if (subAttr.id && !subAttr.deleted) {
                await this.updateAttributeRecursive(subAttr.id, subAttr, tx);
              } else if (!subAttr.id && !subAttr.deleted) {
                await this.createAttributeRecursive(subAttr, val.id, tx);
              }
            }
          }

          continue;
        }

        // ===============================================
        // CREATE NEW VALUE
        // ===============================================

        if (!val.id && !val.deleted) {
          const newVal = await tx.attributeValue.create({
            data: {
              value: val.value,

              value_en: val.value_en?.trim() || null,

              attributeId: id,

              position: val.position ?? 0,
            },
          });

          // Create nested attributes
          if (Array.isArray(val.subAttributes)) {
            for (const subAttr of val.subAttributes) {
              if (!subAttr.deleted) {
                await this.createAttributeRecursive(subAttr, newVal.id, tx);
              }
            }
          }
        }
      }
    }
  }

  private async deleteAttributeValueRelationsRecursive(
    valueId: string,
    tx: any,
  ) {
    // Find all sub-attributes of this value
    const subAttrs = await tx.attribute.findMany({
      where: { parentValueId: valueId },
      select: { id: true },
    });

    for (const subAttr of subAttrs) {
      // Find all values of this sub-attribute
      const subVals = await tx.attributeValue.findMany({
        where: { attributeId: subAttr.id },
        select: { id: true },
      });

      for (const subVal of subVals) {
        // Recursive step
        await this.deleteAttributeValueRelationsRecursive(subVal.id, tx);
      }
    }

    // Nullify references in product_images
    await tx.productImage.updateMany({
      where: { attributeValueId: valueId },
      data: { attributeValueId: null },
    });

    await tx.productImage.updateMany({
      where: { printPositionValueId: valueId },
      data: { printPositionValueId: null },
    });

    await tx.productImage.updateMany({
      where: { printSideValueId: valueId },
      data: { printSideValueId: null },
    });

    // Delete references in product_attribute_values
    await tx.productAttributeValue.deleteMany({
      where: { attributeValueId: valueId },
    });

    // Delete references in product_variant_attribute_values
    await tx.productVariantAttributeValue.deleteMany({
      where: { attributeValueId: valueId },
    });
  }

  private async deleteAttributeRelationsRecursive(
    attributeId: string,
    tx: any,
  ) {
    const vals = await tx.attributeValue.findMany({
      where: { attributeId },
      select: { id: true },
    });

    for (const val of vals) {
      await this.deleteAttributeValueRelationsRecursive(val.id, tx);
    }
  }

  // === DELETE ATTRIBUTE ===
  async deleteAttribute(id: string) {
    const existing = await this.prisma.attribute.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Attribute not found", 404);
    }

    return await this.prisma.$transaction(async (tx) => {
      // Delete all child relations recursively
      await this.deleteAttributeRelationsRecursive(id, tx);

      const deleted = await tx.attribute.delete({
        where: { id },
      });
      return deleted;
    });
  }

  // === LIST ONLY (FOR DROPDOWN) ===
  async getAllAttributesList(productId?: string) {
    try {
      const where: any = {};
      if (productId && productId !== "all" && productId !== "undefined") {
        where.OR = [{ productId: null }, { productId }];
      } else if (productId === "all") {
        // No filter on productId to allow cloning from any attribute
      } else {
        where.productId = null;
      }

      const attributes = await this.prisma.attribute.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          position: true,
          parentValueId: true,
          parentValue: {
            select: {
              id: true,
              value: true,
              attributeId: true,
            },
          },
          values: {
            select: {
              id: true,
              value: true,
              attributeId: true,
              position: true,
            },
            orderBy: {
              position: "asc",
            },
          },
        },
        orderBy: [{ position: "asc" }, { name: "asc" }],
      });

      return attributes;
    } catch (error) {
      console.error("❌ Error in Get Attributes List:", error);
      throw new Error("Failed to fetch attribute list. Check server log.");
    }
  }

  async exportAttributesToExcel(query: AttributeExportQuery): Promise<Buffer> {
    const { startDate, endDate, search } = query;

    const where: any = {}; // Filter by Date Range (createdAt)

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
    } // Filter by Search (name or slug)

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
      ];
    } // 2. MENGAMBIL DATA DARI DATABASE DENGAN RELASI

    const attributes = await this.prisma.attribute.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true, // Ambil semua Attribute Values yang terkait
        values: {
          select: {
            value: true,
            id: true,
          },
          orderBy: { value: "asc" }, // Urutkan Value secara alfabetis
        }, // Hitung jumlah produk yang menggunakan Attribute ini (Opsional)
        _count: {
          select: { products: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }); // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Product Attributes");

    worksheet.columns = [
      { header: "ID (Partial)", key: "id", width: 12 },
      { header: "Nama Atribut", key: "name", width: 45 },
      { header: "Slug", key: "slug", width: 45 },
      { header: "Jumlah Values", key: "valueCount", width: 18 },
      { header: "List Values", key: "valuesList", width: 70 },
      { header: "Digunakan di Produk", key: "productCount", width: 25 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ]; // Menambahkan Data Baris

    attributes.forEach((attribute) => {
      const valuesListString = attribute.values
        .map((val) => `- ${val.value} (ID: ${val.id.substring(0, 8)})`)
        .join("\n");

      worksheet.addRow({
        id: attribute.id.substring(0, 8),
        name: attribute.name,
        slug: attribute.slug,
        valueCount: attribute.values.length,
        valuesList: valuesListString || "Tidak ada Value",
        productCount: attribute._count.products,
        createdAt: attribute.createdAt.toLocaleString("id-ID", {
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
        fgColor: { argb: "FF9800" }, // Warna Oranye untuk Attributes
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Styling Kolom Values List (agar multiline berfungsi)
    worksheet
      .getColumn("valuesList")
      .eachCell({ includeEmpty: false }, (cell) => {
        cell.alignment = {
          wrapText: true,
          vertical: "top",
          horizontal: "left",
        };
      }); // 4. MENGHASILKAN BUFFER DAN MENGEMBALIKAN

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }

  // =====================================================
  // SMART ENGLISH TRANSLATION - ATTRIBUTE UPDATE
  // =====================================================

  private async resolveAttributeEnglish(
    source: string | null | undefined,
    incomingEn: string | null | undefined,
    existingSource: string | null | undefined,
    existingEn: string | null | undefined,
    sourceProvided: boolean,
  ): Promise<string | null | undefined> {
    const currentSource = source?.trim() || "";
    const oldSource = existingSource?.trim() || "";
    const oldEn = existingEn?.trim() || "";

    const manualEn = incomingEn?.trim() || "";

    // Jika EN baru benar-benar berbeda dari nilai lama,
    // prioritaskan input manual.
    if (manualEn && manualEn !== oldEn) {
      return manualEn;
    }

    // Teks Indonesia tidak berubah dan field Inggris
    // tidak dikirim: tidak perlu mengubah data.
    if (!sourceProvided && incomingEn === undefined) {
      return undefined;
    }

    const sourceChanged = sourceProvided && currentSource !== oldSource;

    // Jika sumber dikosongkan, kosongkan EN juga.
    if (!currentSource) {
      return sourceChanged || incomingEn !== undefined ? null : undefined;
    }

    const shouldTranslate =
      sourceChanged ||
      (incomingEn !== undefined && !manualEn) ||
      (sourceProvided && !oldEn);

    if (!shouldTranslate) {
      return undefined;
    }

    try {
      const translated = await translateWithDeepL(currentSource);

      if (!translated?.trim()) {
        throw new Error("DeepL returned empty translation");
      }

      return translated.trim();
    } catch (error) {
      console.warn("⚠️ Failed to translate attribute:", currentSource, error);

      // Jika teks ID berubah, jangan memakai EN lama
      // yang sudah tidak sesuai dengan sumber baru.
      return sourceChanged ? null : oldEn || null;
    }
  }

  // =====================================================
  // PREPARE RECURSIVE TRANSLATION BEFORE TRANSACTION
  // =====================================================

  private async prepareUpdateAttributeTranslations(
    data: any,
    attributeId?: string,
  ): Promise<any> {
    if (data.deleted) {
      return { ...data };
    }

    const existingAttribute = attributeId
      ? await this.prisma.attribute.findUnique({
          where: { id: attributeId },
          select: {
            name: true,
            name_en: true,
          },
        })
      : null;

    if (attributeId && !existingAttribute) {
      throw new ApiError("Attribute not found", 404);
    }

    const result = { ...data };

    const effectiveName =
      data.name !== undefined ? data.name : existingAttribute?.name;

    const translatedName = await this.resolveAttributeEnglish(
      effectiveName,
      data.name_en,
      existingAttribute?.name,
      existingAttribute?.name_en,
      data.name !== undefined || !attributeId,
    );

    if (translatedName !== undefined) {
      result.name_en = translatedName;
    }

    if (Array.isArray(data.values)) {
      result.values = [];

      for (const val of data.values) {
        if (val.deleted) {
          result.values.push({ ...val });
          continue;
        }

        const existingValue = val.id
          ? await this.prisma.attributeValue.findUnique({
              where: { id: val.id },
              select: {
                value: true,
                value_en: true,
              },
            })
          : null;

        if (val.id && !existingValue) {
          throw new ApiError(`Attribute value ${val.id} not found`, 404);
        }

        const preparedValue = { ...val };

        const effectiveValue =
          val.value !== undefined ? val.value : existingValue?.value;

        const translatedValue = await this.resolveAttributeEnglish(
          effectiveValue,
          val.value_en,
          existingValue?.value,
          existingValue?.value_en,
          val.value !== undefined || !val.id,
        );

        if (translatedValue !== undefined) {
          preparedValue.value_en = translatedValue;
        }

        if (Array.isArray(val.subAttributes)) {
          preparedValue.subAttributes = [];

          for (const subAttr of val.subAttributes) {
            if (subAttr.deleted) {
              preparedValue.subAttributes.push({
                ...subAttr,
              });

              continue;
            }

            const preparedSubAttribute =
              await this.prepareUpdateAttributeTranslations(
                subAttr,
                subAttr.id,
              );

            preparedValue.subAttributes.push(preparedSubAttribute);
          }
        }

        result.values.push(preparedValue);
      }
    }

    return result;
  }
}
