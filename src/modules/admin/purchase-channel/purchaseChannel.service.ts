import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { SlugService } from "../../../utils/genereateSlug";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreatePurchaseChannelDTO } from "./dto/createPurchaseChannel.dto";
import { UpdatePurchaseChannelDTO } from "./dto/udpatepurchaseChannel.dto";

@injectable()
export class PurchaseChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly slug: SlugService,
  ) {}

  // === GET ALL ===
  async getAllPurchaseChannels(query: {
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
        where.name = { contains: query.search };
      }

      const count = await this.prisma.purchaseChannel.count({ where });

      const data = await this.prisma.purchaseChannel.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
      });

      const meta = this.pagination.generateMeta({ count, page, take });

      return { data, meta };
    } catch (error) {
      console.error("Error GetAll PurchaseChannel:", error);
      throw new Error("Failed to fetch purchase channels.");
    }
  }

  // === LIST (FOR DROPDOWN) ===
  async getPurchaseChannelList() {
    return this.prisma.purchaseChannel.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });
  }

  // === GET BY ID ===
  async getPurchaseChannelBySlug(slug: string) {
    const channel = await this.prisma.purchaseChannel.findUnique({
      where: { slug },
    });
    if (!channel) throw new ApiError("Purchase channel not found", 404);
    return channel;
  }

  // === CREATE ===
  async createPurchaseChannel(data: CreatePurchaseChannelDTO) {
    const slug = this.slug.create(data.name);

    const exists = await this.prisma.purchaseChannel.findFirst({
      where: { OR: [{ name: data.name }, { slug }] },
    });

    if (exists) {
      throw new ApiError("Purchase channel name already exists", 400);
    }

    const created = await this.prisma.purchaseChannel.create({
      data: {
        name: data.name,
        slug,
        isActive: data.isActive ?? true,
      },
    });

    return created;
  }

  // === UPDATE ===
  async updatePurchaseChannel(slug: string, data: UpdatePurchaseChannelDTO) {
    const existing = await this.prisma.purchaseChannel.findUnique({
      where: { slug },
    });
    if (!existing) throw new ApiError("Purchase channel not found", 404);

    const newSlug =
      data.name && data.name !== existing.name
        ? this.slug.create(data.name)
        : existing.slug;

    const updated = await this.prisma.purchaseChannel.update({
      where: { slug },
      data: {
        ...data,
        slug: newSlug,
      },
    });

    return updated;
  }

  // === DELETE ===
  async deletePurchaseChannel(id: string) {
    const existing = await this.prisma.purchaseChannel.findUnique({
      where: { id },
    });
    if (!existing) throw new ApiError("Purchase channel not found", 404);

    return this.prisma.purchaseChannel.delete({ where: { id } });
  }
}
