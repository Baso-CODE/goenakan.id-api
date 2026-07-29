import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateArticleCategoryDTO {
  // === KONTEN BAHASA INDONESIA (WAJIB) ===
  @IsString({ message: "Nama kategori (ID) harus berupa teks" })
  @IsNotEmpty({ message: "Nama kategori (ID) tidak boleh kosong" })
  name_id!: string;

  @IsString({ message: "Deskripsi (ID) harus berupa teks" })
  @IsOptional()
  description_id?: string;

  // === KONTEN BAHASA INGGRIS (OPSIONAL) ===
  @IsString({ message: "Nama kategori (EN) harus berupa teks" })
  @IsOptional()
  name_en?: string;

  @IsString({ message: "Deskripsi (EN) harus berupa teks" })
  @IsOptional()
  description_en?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateArticleCategoryDTO {
  // Pada Update, semua field bersifat opsional karena kita mungkin hanya mengupdate sebagian data
  @IsString({ message: "Nama kategori (ID) harus berupa teks" })
  @IsOptional()
  name_id?: string;

  @IsString({ message: "Deskripsi (ID) harus berupa teks" })
  @IsOptional()
  description_id?: string;

  @IsString({ message: "Nama kategori (EN) harus berupa teks" })
  @IsOptional()
  name_en?: string;

  @IsString({ message: "Deskripsi (EN) harus berupa teks" })
  @IsOptional()
  description_en?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
