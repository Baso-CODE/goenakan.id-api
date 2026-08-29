import { injectable } from "tsyringe";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateAddressDTO, UpdateAddressDTO } from "./dto/customer-address.dto";

@injectable()
export class CustomerAddressService {
  constructor(private readonly prisma: PrismaService) {}

  // === 1. GET ALL ADDRESSES ===
  async getAddresses(profileId: string) {
    return this.prisma.customerAddress.findMany({
      where: { profileId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  // === 2. GET SINGLE ADDRESS ===
  async getAddressById(profileId: string, addressId: string) {
    const address = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, profileId },
    });

    if (!address) {
      throw new Error("Alamat tidak ditemukan atau Anda tidak memiliki akses.");
    }

    return address;
  }

  // === 3. CREATE NEW ADDRESS ===
  async createAddress(profileId: string, data: CreateAddressDTO) {
    // Cek apakah user sudah punya alamat sebelumnya
    const existingAddressesCount = await this.prisma.customerAddress.count({
      where: { profileId },
    });

    // Jika ini alamat pertama ATAU user eksplisit meminta jadi default
    const isDefault = existingAddressesCount === 0 || data.isDefault;

    // Jika alamat ini dijadikan default, reset alamat lain agar tidak bentrok
    if (isDefault && existingAddressesCount > 0) {
      await this.prisma.customerAddress.updateMany({
        where: { profileId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.customerAddress.create({
      data: {
        profileId,
        label: data.label,
        recipient: data.recipient,
        phone: data.phone,
        country: data.country,
        province: data.province,
        city: data.city,
        district: data.district,
        subDistrict: data.subDistrict, //  TAMBAHAN BARU: Menyimpan kelurahan
        postalCode: data.postalCode,
        fullAddress: data.fullAddress,
        isDefault: isDefault,
      },
    });
  }

  // === 4. UPDATE ADDRESS ===
  async updateAddress(
    profileId: string,
    addressId: string,
    data: UpdateAddressDTO,
  ) {
    // Pastikan alamat tersebut memang milik user ini
    await this.getAddressById(profileId, addressId);

    // Jika user me-set alamat ini jadi default, reset yang lain dulu
    if (data.isDefault) {
      await this.prisma.customerAddress.updateMany({
        where: { profileId, id: { not: addressId }, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.customerAddress.update({
      where: { id: addressId },
      data: {
        ...data, // spread operator ini otomatis akan memperbarui subDistrict jika dikirim dari DTO
      },
    });
  }

  // === 5. DELETE ADDRESS ===
  async deleteAddress(profileId: string, addressId: string) {
    const address = await this.getAddressById(profileId, addressId);

    if (address.isDefault) {
      const fallbackAddress = await this.prisma.customerAddress.findFirst({
        where: { profileId, id: { not: addressId } },
      });

      if (fallbackAddress) {
        await this.prisma.customerAddress.update({
          where: { id: fallbackAddress.id },
          data: { isDefault: true },
        });
      }
    }

    return this.prisma.customerAddress.delete({
      where: { id: addressId },
    });
  }

  // === 6. SET AS DEFAULT (Shortcut) ===
  async setDefaultAddress(profileId: string, addressId: string) {
    await this.getAddressById(profileId, addressId);

    return this.prisma.$transaction(async (tx) => {
      await tx.customerAddress.updateMany({
        where: { profileId },
        data: { isDefault: false },
      });

      return tx.customerAddress.update({
        where: { id: addressId },
        data: { isDefault: true },
      });
    });
  }
}
