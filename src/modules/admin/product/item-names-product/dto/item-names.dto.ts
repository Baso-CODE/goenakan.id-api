import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";

/**
 * DTO untuk membuat Item Name baru
 */
export class CreateItemNameDTO {
  @IsString({ message: "Nama item harus berupa string" })
  @IsNotEmpty({ message: "Nama item tidak boleh kosong" })
  @MinLength(2, { message: "Nama item minimal 2 karakter" })
  name!: string;

  @IsString({ message: "ID Kategori Item harus berupa string" })
  @IsNotEmpty({ message: "ID Kategori Item (Parent) wajib diisi" })
  @IsUUID("4", {
    message: "ID Kategori Item harus berupa format UUID yang valid",
  })
  itemCategoryId!: string;

  @IsString({ message: "Deskripsi harus berupa string" })
  @IsOptional()
  description?: string;

  @IsBoolean({ message: "Status aktif harus berupa boolean" })
  @IsOptional()
  isActive?: boolean;
}

/**
 * DTO untuk memperbarui Item Name
 */
export class UpdateItemNameDTO {
  @IsString({ message: "Nama item harus berupa string" })
  @IsOptional()
  @MinLength(2, { message: "Nama item minimal 2 karakter" })
  name?: string;

  @IsString({ message: "ID Kategori Item harus berupa string" })
  @IsOptional()
  @IsUUID("4", {
    message: "ID Kategori Item harus berupa format UUID yang valid",
  })
  itemCategoryId?: string;

  @IsString({ message: "Deskripsi harus berupa string" })
  @IsOptional()
  description?: string;

  @IsBoolean({ message: "Status aktif harus berupa boolean" })
  @IsOptional()
  isActive?: boolean;
}
