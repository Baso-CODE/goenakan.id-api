import * as ExcelJS from "exceljs";
import { injectable } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { SlugService } from "../../../../utils/genereateSlug";
import { PaginationService } from "../../../pagination/pagination.service";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  CreatePolicyCategoryDTO,
  UpdatePolicyCategoryDTO,
} from "./dto/policy-category.dto";

export interface PolicyCategoryExportQuery {
  startDate?: string;
  endDate?: string;
  isActive?: "true" | "false";
}

@injectable()
export class PolicyCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === GET ALL WITH PAGINATION (Bilingual Search) ===
  async getAllPolicyCategories(query: {
    page?: number;
    take?: number;
    search?: string;
  }) {
    const page = Number(query.page) || 1;
    const take = Number(query.take) || 10;
    const skip = (page - 1) * take;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { nameId: { contains: query.search } },
        { nameEn: { contains: query.search } },
      ];
    }

    const count = await this.prisma.policyCategory.count({ where });
    const data = await this.prisma.policyCategory.findMany({
      where,
      skip,
      take,
      orderBy: { displayOrder: "asc" },
    });

    const meta = this.pagination.generateMeta({ count, page, take });
    return { data, meta };
  }

  // === CREATE ===
  async createPolicyCategory(data: CreatePolicyCategoryDTO) {
    const baseName = data.slug || data.nameEn || data.nameId;
    const slug = this.slug.create(baseName);

    const existing = await this.prisma.policyCategory.findUnique({
      where: { slug },
    });

    if (existing)
      throw new ApiError("Category with this slug already exists", 400);

    return await this.prisma.policyCategory.create({
      data: {
        nameId: data.nameId,
        nameEn: data.nameEn,
        slug,
        descriptionId: data.descriptionId,
        descriptionEn: data.descriptionEn,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  // === UPDATE ===
  async updatePolicyCategory(id: number, data: UpdatePolicyCategoryDTO) {
    const existing = await this.prisma.policyCategory.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Policy Category not found", 404);

    let newSlug = existing.slug;
    if (data.slug) {
      newSlug = this.slug.create(data.slug);
    } else if (data.nameEn && data.nameEn !== existing.nameEn) {
      newSlug = this.slug.create(data.nameEn);
    }

    return await this.prisma.policyCategory.update({
      where: { id },
      data: { ...data, slug: newSlug },
    });
  }

  // === EXCEL EXPORT (Bilingual Columns) ===
  async exportPolicyCategoryToExcel(
    query: PolicyCategoryExportQuery,
  ): Promise<Buffer> {
    const categories = await this.prisma.policyCategory.findMany({
      orderBy: { createdAt: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Policy Categories");

    worksheet.columns = [
      { header: "Name (ID)", key: "nameId", width: 25 },
      { header: "Name (EN)", key: "nameEn", width: 25 },
      { header: "Slug", key: "slug", width: 20 },
      { header: "Status", key: "isActive", width: 15 },
    ];

    categories.forEach((cat) => {
      worksheet.addRow({
        nameId: cat.nameId,
        nameEn: cat.nameEn,
        slug: cat.slug,
        isActive: cat.isActive ? "Active" : "Inactive",
      });
    });

    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
