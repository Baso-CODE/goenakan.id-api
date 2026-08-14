import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
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

  // === CREATE ATTRIBUTE (WITH VALUES & NESTED HIERARCHY RECURSIVELY) ===
  async createAttribute(data: CreateAttributeDTO) {
    return await this.prisma.$transaction(async (tx) => {
      return await this.createAttributeRecursive(data, null, tx);
    });
  }

  private async createAttributeRecursive(
    data: any,
    parentValueId: string | null,
    tx: any,
  ): Promise<any> {
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

    // Check duplicate slug with counter safeguard
    let slugExists = true;
    let finalSlug = generatedSlug;
    let counter = 0;
    while (slugExists) {
      const existing = await tx.attribute.findUnique({
        where: { slug: finalSlug },
      });
      if (existing) {
        counter++;
        finalSlug = `${generatedSlug}-${counter}`;
      } else {
        slugExists = false;
      }
    }

    const attribute = await tx.attribute.create({
      data: {
        name: data.name,
        slug: finalSlug,
        productId: data.productId || null,
        type: data.type || "TEXT",
        parentValueId: parentValueId || null,
      },
    });

    if (data.values && data.values.length > 0) {
      for (let index = 0; index < data.values.length; index++) {
        const v = data.values[index];
        const attrVal = await tx.attributeValue.create({
          data: {
            value: v.value,
            position: v.position ?? index,
            attributeId: attribute.id,
          },
        });

        if (v.subAttributes && v.subAttributes.length > 0) {
          for (const subAttr of v.subAttributes) {
            await this.createAttributeRecursive(subAttr, attrVal.id, tx);
          }
        }
      }
    }

    return await tx.attribute.findUnique({
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

  // === UPDATE ATTRIBUTE (RECURSIVE LOGIC) ===
  async updateAttribute(id: string, data: UpdateAttributeDTO) {
    return await this.prisma.$transaction(async (tx) => {
      await this.updateAttributeRecursive(id, data, tx);
      return await this.getAttributeByIdRecursive(id, tx);
    });
  }

  private async updateAttributeRecursive(id: string, data: any, tx: any) {
    const existing = await tx.attribute.findUnique({
      where: { id },
      include: { values: true },
    });

    if (!existing) {
      throw new ApiError("Attribute not found", 404);
    }

    const newSlug =
      data.name && data.name !== existing.name
        ? this.slug.create(data.name)
        : existing.slug;

    if (newSlug !== existing.slug) {
      const duplicateSlug = await tx.attribute.findUnique({
        where: { slug: newSlug },
      });
      if (duplicateSlug) throw new ApiError("Slug already exists", 400);
    }

    await tx.attribute.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        slug: newSlug,
        position: data.position ?? existing.position,
        type: data.type ?? existing.type,
        parentValueId:
          data.parentValueId !== undefined
            ? data.parentValueId || null
            : existing.parentValueId,
      },
    });

    if (data.values && data.values.length > 0) {
      for (const val of data.values) {
        // DELETE VALUE
        if (val.deleted && val.id) {
          await this.deleteAttributeValueRelationsRecursive(val.id, tx);
          await tx.attributeValue.delete({
            where: { id: val.id },
          });
          continue;
        }

        // UPDATE VALUE
        if (val.id && !val.deleted) {
          await tx.attributeValue.update({
            where: { id: val.id },
            data: {
              value: val.value,
              position: val.position,
            },
          });

          if (val.subAttributes) {
            for (const subAttr of val.subAttributes) {
              if (subAttr.deleted && subAttr.id) {
                // Delete attribute relation and then the attribute
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

        // CREATE NEW VALUE
        if (!val.id && !val.deleted) {
          const newVal = await tx.attributeValue.create({
            data: {
              value: val.value,
              attributeId: id,
              position: val.position,
            },
          });

          if (val.subAttributes) {
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
}
