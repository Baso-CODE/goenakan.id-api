import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

// === DTO UNTUK CREATE TAG ===
export class CreateTagDTO {
  @IsNotEmpty({ message: "Nama tag tidak boleh kosong" })
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;
}

// === DTO UNTUK UPDATE TAG ===
export class UpdateTagDTO {
  @IsOptional()
  @IsNotEmpty({ message: "Nama tag tidak boleh kosong jika ingin diubah" })
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;
}
export class CreateBulkTagsDTO {
  @IsArray()
  @IsString({ each: true, message: "Setiap tag harus berupa teks (string)" })
  @MinLength(1, { each: true, message: "Nama tag tidak boleh kosong" })
  names!: string[];
}

// === DTO UNTUK TAG CATEGORY ===
export class CreateTagCategoryDTO {
  @IsNotEmpty({ message: "Nama kategori tag tidak boleh kosong" })
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}

export class UpdateTagCategoryDTO {
  @IsOptional()
  @IsNotEmpty({ message: "Nama kategori tag tidak boleh kosong jika ingin diubah" })
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
