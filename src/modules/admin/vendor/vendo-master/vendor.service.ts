import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";

import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateVendorDTO } from "./dto/createVendor.dto";
import { UpdateVendorDTO } from "./dto/updateVendor.dto";
export interface VendorExportQuery {
  startDate?: string;
  endDate?: string;
  isActive?: string;
  type?: string;
}
@injectable()
export class VendorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === CREATE VENDOR ===
  async createVendor(data: CreateVendorDTO) {
    try {
      console.log("ini adalah data", data);

      const slug = this.slug.create(data.companyName);
      const existing = await this.prisma.vendor.findFirst({
        where: { companyName: data.companyName },
      });

      if (existing) {
        throw new ApiError("Vendor with this company name already exists", 400);
      }

      // Validasi Kategori
      if (data.type === "SERVICE") {
        const categoryExists = await this.prisma.vendorCategory.findUnique({
          where: { id: data.categoryId },
        });
        if (!categoryExists) {
          throw new ApiError("Selected service category not found", 400);
        }
      } else if (data.type === "PRODUCT") {
        const categoryExists = await this.prisma.productCategory.findUnique({
          where: { id: data.categoryId },
        });
        if (!categoryExists) {
          throw new ApiError("Selected product category not found", 400);
        }
      }

      //  PERBAIKAN 1: Validasi item berdasarkan tipe vendor
      if (data.itemIds?.length) {
        if (data.type === "SERVICE") {
          const items = await this.prisma.vendorItem.findMany({
            where: { id: { in: data.itemIds } },
          });
          if (items.length !== data.itemIds.length) {
            throw new ApiError("One or more service items not found", 400);
          }
        } else if (data.type === "PRODUCT") {
          // Ganti 'itemCategory' dengan nama model Prisma untuk item produkmu
          const items = await this.prisma.itemCategory.findMany({
            where: { id: { in: data.itemIds } },
          });
          if (items.length !== data.itemIds.length) {
            throw new ApiError("One or more product items not found", 400);
          }
        }
      }

      // Membuat Data Vendor
      const vendor = await this.prisma.vendor.create({
        data: {
          companyName: data.companyName,
          slug: slug,
          picName: data.picName,
          type: data.type as any,
          serviceCategoryId: data.type === "SERVICE" ? data.categoryId : null,
          productCategoryId: data.type === "PRODUCT" ? data.categoryId : null,
          country: data.country ?? "",
          province: data.province ?? "",
          city: data.city ?? "",
          district: data.district ?? "",
          subDistrict: data.subDistrict ?? "",
          postalCode: data.postalCode ?? "",
          address: data.address,
          trackingUrl: data.trackingUrl || null,
          isActive: data.isActive ?? true,
        },
      });

      //  PERBAIKAN 2: Simpan relasi item ke tabel yang tepat berdasarkan tipe
      if (data.itemIds?.length) {
        if (data.type === "SERVICE") {
          await this.prisma.vendorVendorItem.createMany({
            data: data.itemIds.map((itemId) => ({
              vendorId: vendor.id,
              itemId: itemId,
            })),
          });
        } else if (data.type === "PRODUCT") {
          // Ganti 'vendorItemCategory' dan 'itemCategoryId' sesuai dengan schema Prisma-mu
          await this.prisma.vendorItemCategory.createMany({
            data: data.itemIds.map((itemCategoryId) => ({
              vendorId: vendor.id,
              itemCategoryId: itemCategoryId,
            })),
          });
        }
      }

      if (data.contacts?.length) {
        await this.prisma.vendorContact.createMany({
          data: data.contacts.map((contact) => ({
            vendorId: vendor.id,
            platformId: contact.platformId,
            contactId: contact.contactId,
          })),
        });
      }

      const vendorWithRelations = await this.prisma.vendor.findUnique({
        where: { id: vendor.id },
        include: {
          serviceCategory: true,
          productCategory: true,
          vendorItems: { include: { item: true } },
          // Pastikan untuk meng-include relasi produk jika ingin dikembalikan ke frontend
          productItemCategories: { include: { itemCategory: true } },
          contacts: { include: { platform: true } },
        },
      });

      return vendorWithRelations;
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(error.message || "Failed to create vendor", 500);
    }
  }

  // === GET ALL VENDORS (WITH PAGINATION, SEARCH, FILTER, & DATE RANGE) ===
  async getAllVendors(query: {
    page?: number;
    take?: number;
    search?: string;
    isActive?: string;
    startDate?: string;
    endDate?: string;
    type?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      // Filter Pencarian
      if (query.search) {
        where.OR = [
          { companyName: { contains: query.search } },
          { picName: { contains: query.search } },
          { country: { contains: query.search } },
          { city: { contains: query.search } },
        ];
      }

      // Filter Status Aktif
      if (query.isActive && query.isActive !== "ALL") {
        where.isActive = query.isActive === "true";
      }

      // Filter Tipe Vendor (SERVICE / PRODUCT)
      if (query.type && query.type !== "ALL") {
        where.type = query.type;
      }

      // Filter Rentang Tanggal
      if (query.startDate || query.endDate) {
        where.createdAt = {};

        if (query.startDate) {
          where.createdAt.gte = new Date(query.startDate);
        }

        if (query.endDate) {
          const end = new Date(query.endDate);
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }

      const count = await this.prisma.vendor.count({ where });

      const data = await this.prisma.vendor.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          companyName: true,
          picName: true,
          country: true,
          city: true,
          type: true,
          isActive: true,
          createdAt: true,
          serviceCategory: {
            select: {
              id: true,
              name: true,
            },
          },
          productCategory: {
            select: {
              id: true,
              name_id: true,
            },
          },
          contacts: {
            select: {
              id: true,
              contactId: true,
              platform: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  icon: true,
                },
              },
            },
          },
        },
      });

      const meta = this.pagination.generateMeta({ count, page, take });

      return { data, meta };
    } catch (error) {
      throw new Error("Failed to fetch vendors.");
    }
  }

  // === GET ALL VENDORS FOR ORDER & CALCULATOR (with category types) ===
  async getAllVendorsForOrder() {
    try {
      const vendors = await this.prisma.vendor.findMany({
        where: { isActive: true },
        orderBy: { companyName: "asc" },
        select: {
          id: true,
          companyName: true,
          type: true,
          picName: true,
          contacts: {
            select: {
              id: true,
              contactId: true,
              isPrimary: true,
              platform: {
                select: {
                  name: true,
                  slug: true,
                },
              },
            },
          },
          serviceCategory: {
            select: {
              id: true,
              name: true,
            },
          },
          productCategory: {
            select: {
              id: true,
              name_id: true,
            },
          },

          vendorItems: {
            select: {
              item: {
                select: {
                  id: true, //  PERBAIKAN 1: Wajib agar frontend bisa mendeteksi ID Jasa
                  name: true, //  PERBAIKAN 1: Wajib agar nama jasa muncul di Dropdown
                  category: {
                    select: {
                      id: true,
                      name: true,
                      type: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      return vendors.map((v) => {
        const typesSet = new Set<string>();
        const categoryNamesSet = new Set<string>();

        if (v.type) {
          typesSet.add(v.type);
        }
        if (v.serviceCategory?.name) {
          categoryNamesSet.add(v.serviceCategory.name);
          typesSet.add("SERVICE");
        }
        if (v.productCategory?.name_id) {
          categoryNamesSet.add(v.productCategory.name_id);
          typesSet.add("PRODUCT");
        }

        v.vendorItems?.forEach((vi) => {
          if (vi.item?.category?.type) {
            typesSet.add(vi.item.category.type);
          }
          if (vi.item?.category?.name) {
            categoryNamesSet.add(vi.item.category.name);
          }
        });

        const types = Array.from(typesSet);
        const categoryNames = Array.from(categoryNamesSet);

        return {
          id: v.id,
          companyName: v.companyName,
          types: types.length > 0 ? types : ["PRODUCT", "SERVICE"],
          categoryNames,
          picName: v.picName,
          contacts: v.contacts,
          vendorItems: v.vendorItems, //  PERBAIKAN 2: Meneruskan data ke frontend!
        };
      });
    } catch (error) {
      console.error("❌ Error in getAllVendorsForOrder:", error);
      throw new Error("Failed to fetch vendors for order.");
    }
  }
  // === GET BY ID ===
  async getVendorById(id: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id },
        include: {
          serviceCategory: true,
          productCategory: true,
          vendorItems: {
            include: {
              item: true,
            },
          },
          productItemCategories: {
            include: {
              itemCategory: true,
            },
          },
          contacts: {
            include: {
              platform: true,
            },
          },
        },
      });

      if (!vendor) throw new ApiError("Vendor not found", 404);

      let resolvedCategoryId = "";
      if (vendor.type === "SERVICE" && vendor.serviceCategoryId) {
        resolvedCategoryId = vendor.serviceCategoryId;
      } else if (vendor.type === "PRODUCT" && vendor.productCategoryId) {
        resolvedCategoryId = vendor.productCategoryId;
      }

      let formattedItems: { id: string; name: string }[] = [];
      if (vendor.type === "SERVICE") {
        formattedItems = vendor.vendorItems.map((vi) => ({
          id: vi.item.id,
          name: vi.item.name,
        }));
      } else if (vendor.type === "PRODUCT") {
        formattedItems = vendor.productItemCategories.map((pic) => ({
          id: pic.itemCategory.id,
          name: pic.itemCategory.name,
        }));
      }

      return {
        id: vendor.id,
        companyName: vendor.companyName,
        picName: vendor.picName,
        country: vendor.country,
        province: vendor.province,
        city: vendor.city,
        district: vendor.district,
        subDistrict: vendor.subDistrict,
        postalCode: vendor.postalCode,
        address: vendor.address,
        isActive: vendor.isActive,
        trackingUrl: vendor.trackingUrl,

        // Data Tipe dan Kategori Utama
        type: vendor.type,
        categoryId: resolvedCategoryId,

        // Data Items yang sudah diseragamkan
        items: formattedItems,

        // Data Contacts
        contacts: vendor.contacts.map((c) => ({
          id: c.id,
          contactId: c.contactId,
          isPrimary: c.isPrimary,
          platform: {
            id: c.platform.id,
            name: c.platform.name,
            slug: c.platform.slug,
            icon: c.platform.icon,
          },
        })),
      };
    } catch (error) {
      console.error("❌ Error in getVendorById:", error);
      if (error instanceof ApiError) throw error;
      throw new ApiError("Failed to fetch vendor detail", 500);
    }
  }
  // === GET BY ID (Complete Vendor Detail) ===
  async getVendorByIdDetail(id: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id },
        include: {
          serviceCategory: true,
          productCategory: true,
          vendorItems: {
            include: {
              item: {
                include: {
                  category: true,
                },
              },
            },
          },
          contacts: {
            include: {
              platform: true,
            },
          },
        },
      });

      if (!vendor) throw new ApiError("Vendor not found", 404);

      let resolvedCategory = null;
      if (vendor.type === "SERVICE" && vendor.serviceCategory) {
        resolvedCategory = {
          id: vendor.serviceCategory.id,
          name: vendor.serviceCategory.name,
          type: "SERVICE",
        };
      } else if (vendor.type === "PRODUCT" && vendor.productCategory) {
        resolvedCategory = {
          id: vendor.productCategory.id,
          name: vendor.productCategory.name_id,
          type: "PRODUCT",
        };
      }

      return {
        id: vendor.id,
        companyName: vendor.companyName,
        picName: vendor.picName,
        country: vendor.country,
        province: vendor.province,
        city: vendor.city,
        district: vendor.district,
        subDistrict: vendor.subDistrict,
        postalCode: vendor.postalCode,
        address: vendor.address,
        isActive: vendor.isActive,
        trackingUrl: vendor.trackingUrl,
        type: vendor.type,
        categoryId:
          vendor.type === "SERVICE"
            ? vendor.serviceCategoryId
            : vendor.productCategoryId,
        category: resolvedCategory,
        items: vendor.vendorItems.map((vi) => ({
          id: vi.item.id,
          name: vi.item.name,
          description: vi.item.description,
          category: vi.item.category
            ? {
                id: vi.item.category.id,
                name: vi.item.category.name,
                type: vi.item.category.type,
              }
            : null,
        })),
        contacts: vendor.contacts.map((c) => ({
          id: c.id,
          contactId: c.contactId,
          isPrimary: c.isPrimary,
          platform: {
            id: c.platform.id,
            name: c.platform.name,
            slug: c.platform.slug,
            icon: c.platform.icon,
          },
        })),
      };
    } catch (error) {
      console.error("❌ Error in getVendorByIdDetail:", error);
      if (error instanceof ApiError) throw error;
      throw new ApiError("Failed to fetch vendor detail", 500);
    }
  }

  // === UPDATE VENDOR ===
  async updateVendor(id: string, data: UpdateVendorDTO) {
    try {
      const existing = await this.prisma.vendor.findUnique({ where: { id } });
      if (!existing) throw new ApiError("Vendor not found", 404);

      const { itemIds, contacts, categoryId, type, ...vendorData } = data;

      const targetType = type ?? existing.type;
      const targetCategoryId = categoryId;

      // 1. VALIDASI KATEGORI
      if (targetCategoryId) {
        if (targetType === "SERVICE") {
          const categoryExists = await this.prisma.vendorCategory.findUnique({
            where: { id: targetCategoryId },
          });
          if (!categoryExists)
            throw new ApiError("Selected service category not found", 400);
        } else if (targetType === "PRODUCT") {
          const categoryExists = await this.prisma.productCategory.findUnique({
            where: { id: targetCategoryId },
          });
          if (!categoryExists)
            throw new ApiError("Selected product category not found", 400);
        }
      }

      // 2. VALIDASI ITEMS BERDASARKAN TIPE VENDOR
      if (itemIds?.length) {
        if (targetType === "SERVICE") {
          const items = await this.prisma.vendorItem.findMany({
            where: { id: { in: itemIds } },
          });
          if (items.length !== itemIds.length) {
            throw new ApiError("One or more service items not found", 400);
          }
        } else if (targetType === "PRODUCT") {
          const items = await this.prisma.itemCategory.findMany({
            where: { id: { in: itemIds } },
          });
          if (items.length !== itemIds.length) {
            throw new ApiError(
              "One or more product item categories not found",
              400,
            );
          }
        }
      }

      const result = await this.prisma.$transaction(async (tx) => {
        let slug = existing.slug;
        if (
          vendorData.companyName &&
          vendorData.companyName !== existing.companyName
        ) {
          slug = this.slug.create(vendorData.companyName);
        }

        let serviceCategoryIdUpdate = existing.serviceCategoryId;
        let productCategoryIdUpdate = existing.productCategoryId;

        if (targetType === "SERVICE") {
          serviceCategoryIdUpdate =
            targetCategoryId !== undefined
              ? targetCategoryId
              : existing.serviceCategoryId;
          productCategoryIdUpdate = null;
        } else if (targetType === "PRODUCT") {
          productCategoryIdUpdate =
            targetCategoryId !== undefined
              ? targetCategoryId
              : existing.productCategoryId;
          serviceCategoryIdUpdate = null;
        }

        const updatedVendor = await tx.vendor.update({
          where: { id },
          data: {
            companyName: vendorData.companyName ?? existing.companyName,
            slug,
            picName: vendorData.picName ?? existing.picName,
            type: targetType as any,
            serviceCategoryId: serviceCategoryIdUpdate,
            productCategoryId: productCategoryIdUpdate,
            country: vendorData.country ?? existing.country,
            province: vendorData.province ?? existing.province,
            city: vendorData.city ?? existing.city,
            district: vendorData.district ?? existing.district,
            subDistrict: vendorData.subDistrict ?? existing.subDistrict,
            postalCode: vendorData.postalCode ?? existing.postalCode,
            address: vendorData.address ?? existing.address,
            isActive: vendorData.isActive ?? existing.isActive,
            trackingUrl: vendorData.trackingUrl ?? existing.trackingUrl,
          },
        });

        // 3. SIMPAN RELASI ITEMS BERDASARKAN TIPE
        if (itemIds) {
          await tx.vendorVendorItem.deleteMany({ where: { vendorId: id } });
          await tx.vendorItemCategory.deleteMany({ where: { vendorId: id } });

          if (itemIds.length > 0) {
            if (targetType === "SERVICE") {
              await tx.vendorVendorItem.createMany({
                data: itemIds.map((itemId) => ({
                  vendorId: id,
                  itemId,
                })),
              });
            } else if (targetType === "PRODUCT") {
              await tx.vendorItemCategory.createMany({
                data: itemIds.map((itemCategoryId) => ({
                  vendorId: id,
                  itemCategoryId,
                })),
              });
            }
          }
        }

        if (contacts) {
          await tx.vendorContact.deleteMany({ where: { vendorId: id } });

          if (contacts.length > 0) {
            await tx.vendorContact.createMany({
              data: contacts.map((c) => ({
                vendorId: id,
                platformId: c.platformId,
                contactId: c.contactId,
              })),
            });
          }
        }

        return tx.vendor.findUnique({
          where: { id: updatedVendor.id },
          include: {
            serviceCategory: true,
            productCategory: true,
            vendorItems: { include: { item: true } },
            productItemCategories: { include: { itemCategory: true } },
            contacts: { include: { platform: true } },
          },
        });
      });

      return result;
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(error.message || "Failed to update vendor", 500);
    }
  }

  // === SOFT DELETE ===
  async deleteVendor(id: string) {
    try {
      const existing = await this.prisma.vendor.findUnique({ where: { id } });
      if (!existing) {
        throw new ApiError("Vendor not found", 404);
      }

      const deleted = await this.prisma.vendor.update({
        where: { id },
        data: { isActive: false },
      });

      return {
        message: "Vendor successfully deactivated",
        deleted,
      };
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(error.message || "Failed to delete vendor", 500);
    }
  }
  // === TOGGLE ACTIVE ===
  async toggleActive(id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new ApiError("Vendor not found", 404);

    return this.prisma.vendor.update({
      where: { id },
      data: { isActive: !vendor.isActive },
    });
  }

  async exportVendorsToExcel(query: VendorExportQuery): Promise<Buffer> {
    const { startDate, endDate, isActive, type } = query;

    // 1. MEMBANGUN KLAUSA WHERE PRISMA
    const where: any = {};

    // Filter by Date Range (createdAt)
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

    // Filter by isActive status
    if (isActive && isActive !== "ALL") {
      where.isActive = isActive === "true";
    }

    if (type && type !== "ALL") {
      where.type = type;
    }

    // 2. MENGAMBIL DATA DARI DATABASE DENGAN RELASI
    const vendors = await this.prisma.vendor.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        picName: true,
        type: true, // 👈 Mengambil Tipe Vendor
        province: true,
        city: true,
        address: true,
        isActive: true,
        createdAt: true,

        // 👇 Mengambil Kategori Jalur 1 (Service)
        serviceCategory: {
          select: { name: true },
        },
        // 👇 Mengambil Kategori Jalur 2 (Product)
        productCategory: {
          select: { name_id: true },
        },

        vendorItems: {
          select: {
            item: {
              select: {
                name: true,
              },
            },
          },
        },
        // Mengambil Contacts
        contacts: {
          select: {
            contactId: true,
            platform: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Vendor Master");

    // Menentukan Kolom (Headers) dengan tambahan Tipe & Kategori
    worksheet.columns = [
      { header: "ID (Partial)", key: "id", width: 12 },
      { header: "Nama Perusahaan", key: "companyName", width: 35 },
      { header: "Tipe Vendor", key: "type", width: 15 }, // 👈 Kolom Tipe
      { header: "Kategori", key: "category", width: 25 }, // 👈 Kolom Kategori
      { header: "Nama PIC", key: "picName", width: 25 },
      { header: "Provinsi", key: "province", width: 20 },
      { header: "Kota", key: "city", width: 20 },
      { header: "Alamat", key: "address", width: 50 },
      { header: "Items yang Ditawarkan", key: "items", width: 50 },
      { header: "Kontak", key: "contacts", width: 50 },
      { header: "Status Aktif", key: "isActive", width: 15 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    // Menambahkan Data Baris
    vendors.forEach((vendor) => {
      // Memetakan nama kategori berdasarkan jalurnya yang aktif
      const categoryName =
        vendor.type === "SERVICE"
          ? vendor.serviceCategory?.name
          : vendor.type === "PRODUCT"
            ? vendor.productCategory?.name_id
            : "-";

      const itemsString = vendor.vendorItems
        .map((vi) => vi.item.name)
        .join(", ");

      const contactsString = vendor.contacts
        .map((c) => `${c.platform.name}: ${c.contactId}`)
        .join(" | ");

      worksheet.addRow({
        id: vendor.id,
        companyName: vendor.companyName,
        type: vendor.type || "-",
        category: categoryName || "-",
        picName: vendor.picName,
        province: vendor.province || "-",
        city: vendor.city || "-",
        address: vendor.address || "-",
        items: itemsString || "-",
        contacts: contactsString || "-",
        isActive: vendor.isActive ? "Ya" : "Tidak",
        createdAt: vendor.createdAt.toLocaleString("id-ID", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    });

    // Styling Header (Warna Hijau Khas Vendor)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "4CAF50" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // 4. MENGHASILKAN BUFFER DAN MENGEMBALIKAN
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }

  async getVendorsByOrder(orderId: string, type?: "PRODUCT" | "SERVICE") {
    try {
      const poWhereCondition: any = {
        items: {
          some: { orderId: orderId },
        },
      };

      if (type === "PRODUCT") {
        poWhereCondition.expenseCategory = {
          in: ["PRODUCT", "PACKAGING"],
        };
      } else if (type === "SERVICE") {
        poWhereCondition.expenseCategory = "LOGISTIC";
      }

      const vendors = await this.prisma.vendor.findMany({
        where: {
          isActive: true,
          purchaseOrders: {
            some: poWhereCondition,
          },
        },
        orderBy: { companyName: "asc" },
        select: {
          id: true,
          companyName: true,
          trackingUrl: true,
          city: true,
          type: true,
          vendorItems: {
            include: {
              item: { include: { category: true } },
            },
          },
        },
      });

      return vendors;
    } catch (error) {
      console.error("❌ Error in getVendorsByOrder via PO:", error);
      throw new Error("Failed to fetch vendors for order via purchase orders.");
    }
  }
}
