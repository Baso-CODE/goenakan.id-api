import { Prisma } from "@prisma/client";
import { injectable } from "tsyringe";
import { ApiError } from "../../utils/api-error";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateShipmentNoteCategoryDTO,
  UpdateShipmentNoteCategoryDTO,
} from "./dto/shipment-note.dto";

@injectable()
export class ShipmentNoteCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  // === GET ALL CATEGORIES ===
  async getAllCategories() {
    return await this.prisma.shipmentNoteCategory.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { notes: true },
        },
      },
    });
  }

  // === GET BY ID ===
  async getCategoryById(id: string) {
    const category = await this.prisma.shipmentNoteCategory.findUnique({
      where: { id },
    });

    if (!category) {
      throw new ApiError("Kategori catatan tidak ditemukan", 404);
    }

    return category;
  }

  // === CREATE ===
  async createCategory(data: CreateShipmentNoteCategoryDTO) {
    const existing = await this.prisma.shipmentNoteCategory.findFirst({
      where: { name: { equals: data.name } },
    });

    if (existing) {
      throw new ApiError("Nama kategori sudah ada", 400);
    }

    return await this.prisma.shipmentNoteCategory.create({
      data: {
        name: data.name,
        templates: (data.templates || []) as unknown as Prisma.InputJsonValue,
      },
    });
  }
  // === UPDATE ===
  async updateCategory(id: string, data: UpdateShipmentNoteCategoryDTO) {
    const existing = await this.prisma.shipmentNoteCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError("Kategori tidak ditemukan", 404);
    }

    const templatesUpdate = data.templates
      ? (data.templates as unknown as Prisma.InputJsonValue)
      : undefined;

    return await this.prisma.shipmentNoteCategory.update({
      where: { id },
      data: {
        name: data.name,
        // --- PERBAIKAN DI SINI ---
        templates: templatesUpdate,
      },
    });
  }
  // === DELETE ===
  async deleteCategory(id: string) {
    const category = await this.prisma.shipmentNoteCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { notes: true },
        },
      },
    });

    if (!category) {
      throw new ApiError("Kategori tidak ditemukan", 404);
    }

    // CEK KEAMANAN: Jangan hapus jika sudah ada shipment yang menggunakan kategori ini
    if (category._count.notes > 0) {
      throw new ApiError(
        "Kategori tidak bisa dihapus karena sudah digunakan dalam transaksi pengiriman",
        400,
      );
    }

    return await this.prisma.shipmentNoteCategory.delete({
      where: { id },
    });
  }
}
