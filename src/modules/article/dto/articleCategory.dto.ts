import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateArticleCategoryDTO {
  @IsString({ message: "Nama kategori harus berupa teks" })
  @IsNotEmpty({ message: "Nama kategori tidak boleh kosong" })
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateArticleCategoryDTO {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
