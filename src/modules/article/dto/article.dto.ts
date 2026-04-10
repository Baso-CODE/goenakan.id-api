import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

export class CreateArticleDTO {
  @IsString()
  @IsNotEmpty({ message: "Judul artikel tidak boleh kosong" })
  title!: string;

  @IsString()
  @IsNotEmpty({ message: "Konten artikel tidak boleh kosong" })
  content!: string;

  @IsString()
  @IsNotEmpty({ message: "Cover image wajib diunggah" })
  coverImage!: string;

  @IsString()
  @IsOptional()
  coverImageId?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsBoolean()
  @IsOptional()
  published?: boolean;

  @IsDateString({}, { message: "Format tanggal publish tidak valid" })
  @IsOptional()
  publishedAt?: string | Date;

  @IsString()
  @IsNotEmpty({ message: "Kategori artikel wajib dipilih" })
  categoryId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[];
}

export class UpdateArticleDTO {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;

  @IsString()
  @IsOptional()
  coverImageId?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsBoolean()
  @IsOptional()
  published?: boolean;

  @IsDateString()
  @IsOptional()
  publishedAt?: string | Date;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[];
}
