import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreatePolicyDTO, UpdatePolicyDTO } from "./dto/policy.dto";

export interface PolicyExportQuery {
  startDate?: string;
  endDate?: string;
  isActive?: "true" | "false";
  categoryId?: number;
}

@injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  // === PUBLIC SERVICE: GET BY CATEGORY SLUG (Localized) ===
  // Fungsi ini mengambil kategori beserta kontennya untuk ditampilkan di UI
  async getPolicyBySlug(slug: string) {
    const category = await this.prisma.policyCategory.findUnique({
      where: { slug },
      include: {
        policies: {
          where: { isActive: true },
          orderBy: { displayOrder: "asc" },
        },
      },
    });

    if (!category) throw new ApiError("Policy category not found", 404);
    return category;
  }

  // === GET BY ID ===
  async getPolicyById(id: number) {
    const policy = await this.prisma.policy.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!policy) throw new ApiError("Policy item not found", 404);
    return policy;
  }

  // === DELETE ===
  async deletePolicy(id: number) {
    const existing = await this.prisma.policy.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Policy item not found", 404);

    return await this.prisma.policy.delete({ where: { id } });
  }

  // === GET ALL WITH PAGINATION (Bilingual Search) ===
  async getAllPolicies(query: {
    page?: number;
    take?: number;
    search?: string;
    categoryId?: number;
  }) {
    const page = Number(query.page) || 1;
    const take = Number(query.take) || 10;
    const skip = (page - 1) * take;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { titleId: { contains: query.search } },
        { titleEn: { contains: query.search } },
        { contentId: { contains: query.search } },
        { contentEn: { contains: query.search } },
      ];
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    const count = await this.prisma.policy.count({ where });
    const data = await this.prisma.policy.findMany({
      where,
      skip,
      take,
      include: { category: true },
      orderBy: { displayOrder: "asc" },
    });

    const meta = this.pagination.generateMeta({ count, page, take });
    return { data, meta };
  }

  // === CREATE ===
  async createPolicy(data: CreatePolicyDTO) {
    const categoryExists = await this.prisma.policyCategory.findUnique({
      where: { id: data.categoryId },
    });

    if (!categoryExists) throw new ApiError("Category ID not found", 404);

    return await this.prisma.policy.create({
      data: {
        titleId: data.titleId,
        titleEn: data.titleEn,
        contentId: data.contentId,
        contentEn: data.contentEn,
        categoryId: data.categoryId,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  // === UPDATE ===
  async updatePolicy(id: number, data: UpdatePolicyDTO) {
    const existing = await this.prisma.policy.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Policy item not found", 404);

    return await this.prisma.policy.update({
      where: { id },
      data: data,
    });
  }

  // === EXCEL EXPORT ===
  async exportPolicyToExcel(query: PolicyExportQuery): Promise<Buffer> {
    const where: any = {};
    if (query.categoryId) where.categoryId = query.categoryId;

    const policies = await this.prisma.policy.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Policies");

    worksheet.columns = [
      { header: "Category", key: "cat", width: 20 },
      { header: "Title (ID)", key: "titleId", width: 25 },
      { header: "Title (EN)", key: "titleEn", width: 25 },
      { header: "Status", key: "isActive", width: 15 },
    ];

    policies.forEach((p) => {
      worksheet.addRow({
        cat: p.category.nameEn,
        titleId: p.titleId,
        titleEn: p.titleEn,
        isActive: p.isActive ? "Active" : "Inactive",
      });
    });

    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }

  // === GET ALL CATEGORIES WITH POLICIES ===
  async getAllCategoriesWithPolicies() {
    try {
      return await this.prisma.policyCategory.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        include: {
          policies: {
            where: { isActive: true },
            orderBy: { displayOrder: "asc" },
          },
        },
      });
    } catch (error) {
      console.error("❌ Error in Get All Categories with Policies:", error);
      throw new Error("Failed to fetch policies data.");
    }
  }
}
