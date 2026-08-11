import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ArticleSeoDTO } from "./articleSEO.dto";

export class CreateArticleDTO {
  @IsString()
  @IsNotEmpty({ message: "Judul artikel tidak boleh kosong" })
  title!: string;

  @IsString()
  @IsOptional()
  title_en?: string; // Opsional: Bisa diisi manual atau auto

  // ✨ TAMBAHAN: Nama Penulis
  @IsString()
  @IsNotEmpty({ message: "Nama penulis wajib diisi" })
  @MinLength(2, { message: "Nama penulis minimal 2 karakter" })
  @MaxLength(100, { message: "Nama penulis maksimal 100 karakter" })
  authorName!: string;

  @IsString()
  @IsNotEmpty({ message: "Konten artikel tidak boleh kosong" })
  content!: string;

  @IsString()
  @IsOptional()
  content_en?: string; // Opsional: Bisa diisi manual atau auto

  @IsBoolean()
  @IsOptional()
  autoTranslate?: boolean;

  @IsString()
  @IsNotEmpty({ message: "Cover image desktop wajib diunggah" })
  coverImage!: string;

  @IsString()
  @IsOptional()
  coverImageId?: string | null; // Tambahkan | null

  @IsString()
  @IsOptional()
  coverImageAlt?: string | null; // Tambahkan | null

  // ✨ TAMBAHAN: Gambar Mobile
  @IsString()
  @IsOptional()
  coverImageMobile?: string | null; // Tambahkan | null

  @IsString()
  @IsOptional()
  coverImageMobileId?: string | null; // Tambahkan | null

  @IsString()
  @IsOptional()
  focusKeywords_id?: string;

  @IsString()
  @IsOptional()
  focusKeywords_en?: string;

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

  @IsOptional()
  @ValidateNested()
  @Type(() => ArticleSeoDTO)
  seo?: ArticleSeoDTO;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[];

  @IsArray({ message: "Tags harus berupa array" })
  @IsString({ each: true, message: "Setiap tag ID harus berupa string" })
  @IsOptional()
  tagIds?: string[];
}

export class UpdateArticleDTO {
  @IsString()
  @IsOptional()
  title?: string;

  // ✨ TAMBAHAN: Translasi Judul
  @IsString()
  @IsOptional()
  title_en?: string;

  @IsString()
  @IsOptional()
  @MinLength(2, { message: "Nama penulis minimal 2 karakter" })
  @MaxLength(100, { message: "Nama penulis maksimal 100 karakter" })
  authorName?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  content_en?: string;

  @IsBoolean()
  @IsOptional()
  autoTranslate?: boolean;

  @IsString()
  @IsOptional()
  coverImage?: string | null; // Tambahkan | null

  @IsString()
  @IsOptional()
  coverImageId?: string | null; // Tambahkan | null

  @IsString()
  @IsOptional()
  coverImageAlt?: string | null; // Tambahkan | null

  // ✨ TAMBAHAN: Gambar Mobile
  @IsString()
  @IsOptional()
  coverImageMobile?: string | null; // Tambahkan | null

  @IsString()
  @IsOptional()
  coverImageMobileId?: string | null; // Tambahkan | null

  // ✅ PERBAIKAN: Disesuaikan dengan logic service menjadi _id dan _en
  @IsString()
  @IsOptional()
  focusKeywords_id?: string;

  @IsString()
  @IsOptional()
  focusKeywords_en?: string;

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

  @IsOptional()
  @ValidateNested()
  @Type(() => ArticleSeoDTO)
  seo?: ArticleSeoDTO;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[];

  @IsArray({ message: "Tags harus berupa array" })
  @IsString({ each: true, message: "Setiap tag ID harus berupa string" })
  @IsOptional()
  tagIds?: string[];
}
