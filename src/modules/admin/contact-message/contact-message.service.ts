import { injectable } from "tsyringe";

import { ApiError } from "../../../utils/api-error";
import { PaginationService } from "../../pagination/pagination.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateContactMessageDTO } from "./dto/contact-message.dto";

interface ContactQuery {
  page?: number;
  take?: number;
  search?: string;
  isRead?: string | boolean; // Filter pesan yang sudah/belum dibaca
}

@injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
  ) {}

  // =========================================================================
  // 1. CREATE MESSAGE (Untuk dipakai di Frontend Client / Halaman Landing Page)
  // =========================================================================
  async createContactMessage(data: CreateContactMessageDTO) {
    try {
      const newMessage = await this.prisma.contactMessage.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          interest: data.interest,
          message: data.message,
        },
      });

      return newMessage;
    } catch (error) {
      console.error("🔥 ERROR CREATING CONTACT MESSAGE:", error);
      throw new ApiError("Gagal mengirim pesan, silakan coba lagi.", 500);
    }
  }

  // =========================================================================
  // 2. GET ALL MESSAGES (Untuk dipakai di Dashboard Admin)
  // =========================================================================
  async getAllContactMessages(query: {
    page?: number;
    take?: number;
    search?: string;
    isRead?: string | boolean;
  }) {
    try {
      const page = Number(query.page) || 1;
      const take = Number(query.take) || 10;
      const skip = (page - 1) * take;

      const where: any = {};

      // === Filter Pencarian ===
      if (query.search && query.search.trim() !== "") {
        const searchTerm = query.search.trim();
        where.OR = [
          { name: { contains: searchTerm } },
          { email: { contains: searchTerm } },
          { phone: { contains: searchTerm } },
        ];
      }

      // === Filter Status Baca ===
      if (query.isRead !== undefined && query.isRead !== "") {
        where.isRead = query.isRead === "true" || query.isRead === true;
      }

      // === Total data untuk pagination ===
      const count = await this.prisma.contactMessage.count({ where });

      // === Ambil data pesan ===
      const data = await this.prisma.contactMessage.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      });

      // === Metadata pagination ===
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
      console.error("❌ Error in Get All Contact Messages:", error);
      throw new Error(
        "Failed to fetch contact messages. See server log for details.",
      );
    }
  }

  // =========================================================================
  // 3. GET MESSAGE DETAIL (Untuk dipakai di Dashboard Admin)
  // =========================================================================
  async getContactMessageDetail(id: number) {
    const message = await this.prisma.contactMessage.findUnique({
      where: { id },
    });

    if (!message) {
      throw new ApiError("Pesan tidak ditemukan", 404);
    }

    // ✨ FITUR PINTAR: Jika pesan belum dibaca, otomatis ubah statusnya menjadi "Sudah Dibaca"
    if (!message.isRead) {
      const updatedMessage = await this.prisma.contactMessage.update({
        where: { id },
        data: { isRead: true },
      });
      return updatedMessage;
    }

    return message;
  }

  // =========================================================================
  // 4. DELETE MESSAGE (Bonus: Untuk admin menghapus pesan spam)
  // =========================================================================
  async deleteContactMessage(id: number) {
    const message = await this.prisma.contactMessage.findUnique({
      where: { id },
    });

    if (!message) {
      throw new ApiError("Pesan tidak ditemukan", 404);
    }

    await this.prisma.contactMessage.delete({
      where: { id },
    });

    return { message: "Pesan berhasil dihapus" };
  }
}
