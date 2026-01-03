import { injectable } from "tsyringe";
import { PrismaService } from "../prisma/prisma.service";
import { PaginationService } from "../pagination/pagination.service";
import { SlugService } from "../../utils/genereateSlug";
import { UpdateDepartmentDTO } from "./dto/updateDepartment.dto";
import { ApiError } from "../../utils/api-error";
import { CreateDepartmentDTO } from "./dto/createDepartment.dto";
import * as ExcelJS from "exceljs";

export interface DepartmentExportQuery {
  startDate?: string;
  endDate?: string;
  isActive?: "true" | "false";
}
@injectable()
export class DepartmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === GET ALL WITH PAGINATION ===
  async getAllDepartments(query: {
    page?: number;
    take?: number;
    search?: string;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      if (query.search) {
        where.name = {
          contains: query.search,
        };
      }

      const count = await this.prisma.department.count({ where });

      const data = await this.prisma.department.findMany({
        where,
        skip,
        take,
        orderBy: {
          createdAt: "desc",
        },
      });

      const meta = this.pagination.generateMeta({
        count,
        page,
        take,
      });

      return { data, meta };
    } catch (error) {
      console.error("❌ Error in Get All Departments:", error);
      throw new Error("Failed to fetch departments.");
    }
  }

  // === CREATE DEPARTMENT ===
  async createDepartment(data: CreateDepartmentDTO) {
    const slug = this.slug.create(data.name);

    const existing = await this.prisma.department.findFirst({
      where: { name: data.name },
    });

    if (existing) {
      throw new ApiError("Department name already exists", 400);
    }

    const department = await this.prisma.department.create({
      data: {
        name: data.name,
        slug: slug,
      },
    });

    return department;
  }

  // === GET BY ID ===
  async getDepartmentBySlug(slug: string) {
    const dept = await this.prisma.department.findUnique({
      where: { slug },
    });

    if (!dept) throw new ApiError("Department not found", 404);

    return dept;
  }

  // === UPDATE DEPARTMENT ===
  async updateDepartment(slug: string, data: Partial<UpdateDepartmentDTO>) {
    const existing = await this.prisma.department.findUnique({
      where: { slug },
    });

    if (!existing) throw new ApiError("Department not found", 404);

    const newSlug =
      data.name && data.name !== existing.name
        ? this.slug.create(data.name)
        : existing.slug;

    const updated = await this.prisma.department.update({
      where: { slug },
      data: {
        ...data,
        slug: newSlug,
      },
    });

    return updated;
  }

  // === DELETE (HARD DELETE) ===
  async deleteDepartment(id: string) {
    const existing = await this.prisma.department.findUnique({
      where: { id },
    });

    if (!existing) throw new ApiError("Department not found", 404);

    const deleted = await this.prisma.department.delete({
      where: { id },
    });

    return deleted;
  }

  // === LIST ALL (NO PAGINATION) ===
  async getAllDepartmentsList() {
    try {
      return await this.prisma.department.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    } catch (error) {
      console.error("❌ Error in Get Department List:", error);
      throw new Error("Failed to fetch department list.");
    }
  }

  async exportDepartmentToExcel(query: DepartmentExportQuery): Promise<Buffer> {
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

    // 2. MENGAMBIL DATA DARI DATABASE
    // Menggunakan model VendorCategory
    const categories = await this.prisma.vendorCategory.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        description: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 3. MEMBUAT WORKBOOK EXCEL DENGAN EXCELJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Department Client");

    // Menentukan Kolom (Headers) sesuai skema VendorCategory
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Nama Department", key: "name", width: 30 },
      { header: "Slug", key: "slug", width: 25 },
      { header: "Status Aktif", key: "isActive", width: 15 },
      { header: "Tanggal Dibuat", key: "createdAt", width: 25 },
    ];

    // Menambahkan Data Baris
    categories.forEach((department) => {
      worksheet.addRow({
        id: department.id,
        name: department.name,
        slug: department.slug,
        isActive: department.isActive ? "Ya" : "Tidak",
        createdAt: department.createdAt.toLocaleString("id-ID", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    });

    // Styling Header (Opsional)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "003366" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
