import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";

/**
 * DTO untuk membuat Item Category baru
 */
export class CreateItemCategoryDTO {
  @IsString({ message: "Nama kategori item harus berupa string" })
  @IsNotEmpty({ message: "Nama kategori item tidak boleh kosong" })
  @MinLength(2, { message: "Nama kategori item minimal 2 karakter" })
  name!: string;

  @IsString({ message: "ID Kategori Produk harus berupa string" })
  @IsNotEmpty({ message: "ID Kategori Produk (Parent) wajib diisi" })
  @IsUUID("4", {
    message: "ID Kategori Produk harus berupa format UUID yang valid",
  })
  productCategoryId!: string;

  @IsString({ message: "Deskripsi harus berupa string" })
  @IsOptional()
  description?: string;
}

/**
 * DTO untuk memperbarui Item Category
 */
export class UpdateItemCategoryDTO {
  @IsString({ message: "Nama kategori item harus berupa string" })
  @IsOptional()
  @MinLength(2, { message: "Nama kategori item minimal 2 karakter" })
  name?: string;

  @IsString({ message: "ID Kategori Produk harus berupa string" })
  @IsOptional()
  @IsUUID("4", {
    message: "ID Kategori Produk harus berupa format UUID yang valid",
  })
  productCategoryId?: string;

  @IsString({ message: "Deskripsi harus berupa string" })
  @IsOptional()
  description?: string;
}
