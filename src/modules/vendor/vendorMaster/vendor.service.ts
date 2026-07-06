import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";
import { ApiError } from "../../../utils/api-error";
import { SlugService } from "../../../utils/genereateSlug";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateVendorDTO } from "./dto/createVendor.dto";
import { UpdateVendorDTO } from "./dto/updateVendor.dto";
export interface VendorExportQuery {
  startDate?: string;
  endDate?: string;
  isActive?: "true" | "false";
  // Tambahkan filter lain di sini (misalnya, filter berdasarkan province atau itemIds jika diperlukan)
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
      const slug = this.slug.create(data.companyName);
      const existing = await this.prisma.vendor.findFirst({
        where: { companyName: data.companyName },
      });

      if (existing) {
        throw new ApiError("Vendor with this company name already exists", 400);
      }

      if (data.itemIds?.length) {
        const items = await this.prisma.vendorItem.findMany({
          where: { id: { in: data.itemIds } },
        });

        if (items.length !== data.itemIds.length) {
          throw new ApiError("One or more vendor items not found", 400);
        }
      }

      const vendor = await this.prisma.vendor.create({
        data: {
          companyName: data.companyName,
          slug: slug,
          picName: data.picName,
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

      if (data.itemIds?.length) {
        await this.prisma.vendorVendorItem.createMany({
          data: data.itemIds.map((itemId) => ({
            vendorId: vendor.id,
            itemId,
          })),
        });
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
          vendorItems: { include: { item: true } },
          contacts: { include: { platform: true } },
        },
      });

      return vendorWithRelations;
    } catch (error: any) {
      throw new ApiError("Failed to create vendor", 500);
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
        ];
      }

      // Filter Status Aktif
      if (query.isActive && query.isActive !== "ALL") {
        where.isActive = query.isActive === "true";
      }

      // === FILTER RENTANG TANGGAL (BARU) ===
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
          isActive: true,
          createdAt: true,
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
  // === GET ALL VENDORS FOR ORDER (simplified, only id & name) ===
  async getAllVendorsForOrder() {
    try {
      const vendors = await this.prisma.vendor.findMany({
        where: { isActive: true },
        orderBy: { companyName: "asc" },
        select: {
          id: true,
          companyName: true,
        },
      });

      return vendors;
    } catch (error) {
      console.error("❌ Error in getAllVendorsForOrder:", error);
      throw new Error("Failed to fetch vendors for order.");
    }
  }

  // === GET BY ID ===
  async getVendorById(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
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

    return {
      // 1. Data Utama
      id: vendor.id,
      companyName: vendor.companyName,
      picName: vendor.picName,
      isActive: vendor.isActive,
      trackingUrl: vendor.trackingUrl, // ✅ Tambahkan ini

      // 2. Data Alamat Lengkap
      country: vendor.country,
      province: vendor.province,
      city: vendor.city,
      district: vendor.district,
      subDistrict: vendor.subDistrict,
      postalCode: vendor.postalCode,
      address: vendor.address,

      // 3. Items (Flattened)
      // Kita ubah nama jadi 'items' agar frontend lebih mudah
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

      // 4. Contacts
      contacts: vendor.contacts.map((c) => ({
        id: c.id, // ID tabel pivot
        contactId: c.contactId, // ID kontak/username
        platform: {
          id: c.platform.id,
          name: c.platform.name,
          slug: c.platform.slug,
          icon: c.platform.icon,
        },
      })),
    };
  }
  // === GET BY ID (Complete Vendor Detail) ===
  async getVendorByIdDetail(id: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id },
        include: {
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

      return {
        id: vendor.id,
        companyName: vendor.companyName,
        picName: vendor.picName,
        country: vendor.country,
        address: vendor.address,
        isActive: vendor.isActive,

        // === VENDOR ITEMS ===
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

        // === CONTACTS ===
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

      const { itemIds, contacts, ...vendorData } = data;

      if (itemIds?.length) {
        const items = await this.prisma.vendorItem.findMany({
          where: { id: { in: itemIds } },
        });
        if (items.length !== itemIds.length) {
          throw new ApiError("One or more vendor items not found", 400);
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
        const updatedVendor = await tx.vendor.update({
          where: { id },
          data: {
            companyName: vendorData.companyName ?? existing.companyName,
            slug,
            picName: vendorData.picName ?? existing.picName,
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

        if (itemIds) {
          await tx.vendorVendorItem.deleteMany({ where: { vendorId: id } });

          if (itemIds.length > 0) {
            await tx.vendorVendorItem.createMany({
              data: itemIds.map((itemId) => ({
                vendorId: id,
                itemId,
              })),
            });
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
            vendorItems: { include: { item: true } },
            contacts: { include: { platform: true } },
          },
        });
      });

      return result;
    } catch (error: any) {
      throw new ApiError("Failed to update vendor", 500);
    }
  }

  // === SOFT DELETE ===
  async deleteVendor(id: string) {
    const existing = await this.prisma.vendor.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Vendor not found", 404);

    const deleted = await this.prisma.vendor.update({
      where: { id },
      data: { isActive: false },
    });

    return deleted;
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
    const { startDate, endDate, isActive } = query;

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
    if (isActive) {
      where.isActive = isActive === "true";
    }

    // 2. MENGAMBIL DATA DARI DATABASE DENGAN RELASI
    const vendors = await this.prisma.vendor.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        picName: true,
        province: true,
        city: true,
        address: true,
        isActive: true,
        createdAt: true,

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

    // Menentukan Kolom (Headers)
    worksheet.columns = [
      { header: "ID (Partial)", key: "id", width: 12 },
      { header: "Nama Perusahaan", key: "companyName", width: 35 },
      { header: "Nama PIC", key: "picName", width: 25 },
      { header: "Provinsi", key: "province", width: 20 },
      { header: "Kota", key: "city", width: 20 },
      { header: "Alamat", key: "address", width: 50 },
      { header: "Items yang Ditawarkan", key: "items", width: 50 }, // Relasi
      { header: "Kontak", key: "contacts", width: 50 }, // Relasi
      { header: "Status Aktif", key: "isActive", width: 15 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    // Menambahkan Data Baris
    vendors.forEach((vendor) => {
      // Memformat data relasi menjadi string tunggal untuk sel Excel
      const itemsString = vendor.vendorItems
        .map((vi) => vi.item.name)
        .join(", ");

      const contactsString = vendor.contacts
        .map((c) => `${c.platform.name}: ${c.contactId}`)
        .join(" | ");

      worksheet.addRow({
        id: vendor.id,
        companyName: vendor.companyName,
        picName: vendor.picName,
        province: vendor.province || "-",
        city: vendor.city || "-",
        address: vendor.address || "-",
        items: itemsString,
        contacts: contactsString,
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

    // Styling Header (Sama seperti sebelumnya)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "4CAF50" }, // Menggunakan warna hijau untuk Vendor
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

      // 2. Filter CUKUP berdasarkan Kategori Transaksi (Expense Category) di PO
      if (type === "PRODUCT") {
        poWhereCondition.expenseCategory = {
          in: ["PRODUCT", "PACKAGING"],
        };
      } else if (type === "SERVICE") {
        poWhereCondition.expenseCategory = "LOGISTIC";
      }

      // 3. Eksekusi Query
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
          trackingUrl: true, // Diperlukan untuk tracking ekspedisi
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
