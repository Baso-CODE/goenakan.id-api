import { injectable } from "tsyringe";

import * as ExcelJS from "exceljs";
import { ApiError } from "../../utils/api-error";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { PaginationService } from "../pagination/pagination.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSalesBankDTO, CreateSalesDTO } from "./dto/createSales.dto";
import { UpdateCoreData, UpdateSalesDTO } from "./dto/updateSales.dto";

export interface SalesExportQuery {
  startDate?: string;
  endDate?: string;
  isActive?: "true" | "false" | "ALL";
  // Anda bisa menambahkan filter lain di masa depan, misal berdasarkan prefix
}
@injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // === CREATE SALES ===
  async createSales(data: CreateSalesDTO, file?: Express.Multer.File) {
    const existing = await this.prisma.sales.findFirst({
      where: {
        name: data.name,
        phone: data.phone,
      },
    });

    if (existing) {
      throw new ApiError(
        "Sales person with this name and phone already exists",
        400,
      );
    }

    const { bankAccounts, ...salesData } = data;

    let signatureUrl: string | undefined = salesData.signatureUrl;
    let signaturePublicId: string | undefined = undefined;

    if (file) {
      try {
        const uploadResult = await this.cloudinary.upload(file);
        signatureUrl = uploadResult.secure_url;
        signaturePublicId = uploadResult.public_id;
      } catch (uploadError) {
        throw new ApiError(
          "Failed to upload signature image to Cloudinary",
          500,
        );
      }
    }

    const sales = await this.prisma.$transaction(async (tx) => {
      // 1. Buat Sales Utama
      const newSales = await tx.sales.create({
        data: {
          prefix: salesData.prefix,
          name: salesData.name,
          phone: salesData.phone,
          signatureUrl: signatureUrl,
          signaturePublicId: signaturePublicId,
          isActive: salesData.isActive ?? true,
        },
      });

      // 2. Kaitkan dengan Bank Accounts (Jika ada)
      if (bankAccounts && bankAccounts.length > 0) {
        // Buat data untuk SalesBank
        const bankData = bankAccounts.map((bank) => ({
          salesId: newSales.id,
          bankName: bank.bankName,
          accountNumber: bank.accountNumber,
          accountHolderName: bank.accountHolderName,
        }));

        await tx.salesBank.createMany({
          data: bankData,
          // Lewati duplikasi jika ada (berdasarkan @@id([salesId, accountNumber]))
          skipDuplicates: true,
        });
      }

      return newSales;
    });

    // Ambil lagi data sales lengkap dengan relasi bank
    const salesWithBanks = await this.prisma.sales.findUnique({
      where: { id: sales.id },
      include: {
        bankAccounts: true, // Ambil semua akun bank
      },
    });

    return salesWithBanks;
  }

  // === GET ALL SALES FOR ORDER (tanpa pagination) ===
  async getAllSalesForOrder() {
    try {
      const salesList = await this.prisma.sales.findMany({
        include: {
          bankAccounts: true,
        },
        orderBy: { createdAt: "desc" },
      });

      // Format hanya field penting
      const formatted = salesList.map((s) => ({
        id: s.id,
        prefix: s.prefix,
        name: s.name,
        phone: s.phone,
        signatureUrl: s.signatureUrl,
        isActive: s.isActive,
        bankAccounts: s.bankAccounts.map((b) => ({
          bankName: b.bankName,
          accountNumber: b.accountNumber,
          accountHolderName: b.accountHolderName,
        })),
      }));

      return formatted;
    } catch (error) {
      console.error("❌ Error in getAllSalesForOrder:", error);
      throw new Error("Failed to fetch sales for order.");
    }
  }

  // === UPDATE SALES ===
  async updateSales(id: string, data: UpdateSalesDTO) {
    const existing = await this.prisma.sales.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Sales person not found", 404);

    const { bankAccounts, ...coreUpdateData } = data; // bankAccounts akan diabaikan!

    // Cek duplikasi hanya jika 'name' atau 'phone' diubah
    if (coreUpdateData.name || coreUpdateData.phone) {
      // ... (Logika Cek Duplikasi tetap sama)
      const duplicate = await this.prisma.sales.findFirst({
        where: {
          name: coreUpdateData.name ?? existing.name,
          phone: coreUpdateData.phone ?? existing.phone,
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new ApiError(
          "Sales person with this name/phone already exists",
          400,
        );
      }
    }

    const updatedSales = await this.prisma.sales.update({
      where: { id },
      data: coreUpdateData as UpdateCoreData,
      include: {
        bankAccounts: true,
      },
    });

    return updatedSales;
  }

  // === GET ALL SALES (WITH PAGINATION, SEARCH, FILTER ACTIVE) ===
  async getAllSales(query: {
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

      // 1. Logika Search (Berdasarkan name, phone, atau prefix)
      if (query.search) {
        where.OR = [
          { name: { contains: query.search } },
          { phone: { contains: query.search } },
          { prefix: { contains: query.search } },
        ];
      }

      // 2. Logika Filter isActive
      if (query.isActive && query.isActive !== "ALL") {
        where.isActive = query.isActive === "true";
      }

      // === Total count for pagination ===
      const count = await this.prisma.sales.count({ where });

      // === Query data ===
      const data = await this.prisma.sales.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          bankAccounts: true,
        },
      });

      // === Generate pagination meta ===
      const meta = this.pagination.generateMeta({
        count,
        page,
        take,
      });

      return {
        data,
        meta,
      };
    } catch (error) {
      console.error("❌ Error in Get All Sales:", error);
      throw new Error("Failed to fetch sales. See server log for details.");
    }
  }

  // === GET BY ID ===
  async getSalesById(id: string) {
    const sales = await this.prisma.sales.findUnique({
      where: { id },
      include: {
        bankAccounts: true,
      },
    });

    if (!sales) throw new ApiError("Sales person not found", 404);
    return sales;
  }

  // === DELETE SALES (Soft Delete) ===
  async deleteSales(id: string) {
    const existing = await this.prisma.sales.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Sales person not found", 404);

    const deleted = await this.prisma.sales.update({
      where: { id },
      data: { isActive: false },
    });

    return deleted;
  }

  // === TOGGLE ACTIVE ===
  async toggleActive(id: string) {
    const sales = await this.prisma.sales.findUnique({ where: { id } });
    if (!sales) throw new ApiError("Sales person not found", 404);

    return this.prisma.sales.update({
      where: { id },
      data: { isActive: !sales.isActive },
    });
  }

  // === UPDATE SALES BANK ACCOUNTS ===
  async updateSalesBankAccounts(
    id: string,
    bankAccounts: CreateSalesBankDTO[],
  ) {
    const existingSales = await this.prisma.sales.findUnique({ where: { id } });
    if (!existingSales) throw new ApiError("Sales person not found", 404);

    // 1. Validasi: Akun bank yang masuk harus unik
    const uniqueAccounts = new Set(bankAccounts.map((b) => b.accountNumber));
    if (uniqueAccounts.size !== bankAccounts.length) {
      throw new ApiError("Duplicate account numbers found in input list", 400);
    }

    // 2. Transaksi: Hapus yang lama, masukkan yang baru
    await this.prisma.$transaction(async (tx) => {
      await tx.salesBank.deleteMany({
        where: { salesId: id },
      });

      // b. Buat akun bank yang baru
      if (bankAccounts && bankAccounts.length > 0) {
        const bankData = bankAccounts.map((bank) => ({
          salesId: id,
          bankName: bank.bankName,
          accountNumber: bank.accountNumber,
          accountHolderName: bank.accountHolderName,
        }));

        await tx.salesBank.createMany({
          data: bankData,
        });
      }
    });

    // 3. Ambil data lengkap untuk dikembalikan
    return this.prisma.sales.findUnique({
      where: { id },
      include: { bankAccounts: true },
    });
  }

  async exportSalesToExcel(query: SalesExportQuery): Promise<Buffer> {
    const { startDate, endDate, isActive } = query;

    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // Tambahkan satu hari agar tanggal akhir inklusif (sampai akhir hari)
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.createdAt.lt = end;
      }
    } // Filter by isActive status

    if (isActive && isActive !== "ALL") {
      where.isActive = isActive === "true";
    } // 2. MENGAMBIL DATA DARI DATABASE DENGAN RELASI

    const salesData = await this.prisma.sales.findMany({
      where,
      select: {
        id: true,
        prefix: true,
        name: true,
        phone: true,
        isActive: true,
        createdAt: true, // Hitung jumlah Orders
        _count: {
          select: { orders: true },
        }, // Ambil data Bank Accounts
        bankAccounts: {
          select: {
            bankName: true,
            accountNumber: true,
            accountHolderName: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }); // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Sales"); // Menentukan Kolom (Headers)

    worksheet.columns = [
      { header: "ID (Partial)", key: "id", width: 12 },
      { header: "Nama Lengkap", key: "fullName", width: 40 },
      { header: "Telepon", key: "phone", width: 20 },
      { header: "Jumlah Orders", key: "orderCount", width: 18 },
      { header: "Rekening Bank", key: "bankInfo", width: 70 },
      { header: "Status Aktif", key: "isActive", width: 15 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ]; // Menambahkan Data Baris

    salesData.forEach((sales) => {
      // Gabungkan Prefix dan Nama
      const fullName = `${sales.prefix ? sales.prefix + " " : ""}${sales.name}`;

      const bankInfoString = sales.bankAccounts
        .map(
          (bank) =>
            `- ${bank.bankName}: ${bank.accountNumber} (${bank.accountHolderName})`,
        )
        .join("\n"); // Gunakan \n untuk multiline

      worksheet.addRow({
        id: sales.id.substring(0, 8), // Ambil 8 karakter pertama ID
        fullName: fullName,
        phone: sales.phone,
        orderCount: sales._count.orders,
        bankInfo: bankInfoString || "N/A",
        isActive: sales.isActive ? "Aktif" : "Nonaktif",
        createdAt: sales.createdAt.toLocaleString("id-ID", {
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
        fgColor: { argb: "4CAF50" }, // Warna hijau yang bagus untuk Sales
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Styling Kolom Bank (agar multiline berfungsi)
    worksheet
      .getColumn("bankInfo")
      .eachCell({ includeEmpty: false }, (cell) => {
        cell.alignment = {
          wrapText: true,
          vertical: "top",
          horizontal: "left",
        };
      });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
