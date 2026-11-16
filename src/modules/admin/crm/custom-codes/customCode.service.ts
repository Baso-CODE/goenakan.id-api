import { CrmCustomCodeType } from "@prisma/client";
import { injectable, singleton } from "tsyringe";
import { ApiError } from "../../../../utils/api-error";
import { PrismaService } from "../../../prisma/prisma.service";
import { CreateCustomCodeDTO } from "./dto/createCustomCode.dto";
import { UpdateCustomCodeDTO } from "./dto/updateCustomCode.dto";

@singleton()
@injectable()
export class CustomCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(type?: CrmCustomCodeType, search?: string) {
    const where: any = {};

    if (type) {
      where.type = type;
    }

    if (search && search.trim().length > 0) {
      where.OR = [
        { code: { contains: search.trim() } },
        { label: { contains: search.trim() } },
      ];
    }

    const items = await this.prisma.crmCustomCode.findMany({
      where,
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            leads: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return items;
  }

  async getById(id: string) {
    const item = await this.prisma.crmCustomCode.findUnique({
      where: { id },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!item) {
      throw new ApiError("Kode kustom tidak ditemukan", 404);
    }

    return item;
  }

  async create(dto: CreateCustomCodeDTO) {
    const normalizedCode = dto.code.trim().toUpperCase().replace(/\s+/g, "-");

    const existing = await this.prisma.crmCustomCode.findUnique({
      where: { code: normalizedCode },
    });

    if (existing) {
      throw new ApiError(`Kode "${normalizedCode}" sudah digunakan.`, 400);
    }

    // Jika tipe CS_AGENT_CODE, validasi apakah assignedUserId ada
    if (dto.type === CrmCustomCodeType.CS_AGENT_CODE && dto.assignedUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.assignedUserId },
      });
      if (!user) {
        throw new ApiError("User CS yang dipilih tidak ditemukan", 404);
      }
    }

    const created = await this.prisma.crmCustomCode.create({
      data: {
        code: normalizedCode,
        label: dto.label.trim(),
        type: dto.type,
        leadUrlRef: dto.leadUrlRef?.trim() || null,
        assignedUserId: dto.assignedUserId || null,
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return created;
  }

  async update(id: string, dto: UpdateCustomCodeDTO) {
    await this.getById(id);

    if (dto.assignedUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.assignedUserId },
      });
      if (!user) {
        throw new ApiError("User CS tidak ditemukan", 404);
      }
    }

    const updated = await this.prisma.crmCustomCode.update({
      where: { id },
      data: {
        label: dto.label !== undefined ? dto.label.trim() : undefined,
        leadUrlRef: dto.leadUrlRef !== undefined ? dto.leadUrlRef?.trim() || null : undefined,
        assignedUserId: dto.assignedUserId !== undefined ? dto.assignedUserId || null : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return updated;
  }

  async delete(id: string) {
    await this.getById(id);

    // Soft deactivate agar riwayat lead tetap valid
    const deactivated = await this.prisma.crmCustomCode.update({
      where: { id },
      data: { isActive: false },
    });

    return deactivated;
  }
}
