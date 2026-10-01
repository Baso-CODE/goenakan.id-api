import {
  IsJSON,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from "class-validator";

// Kita namakan 'ProductSeoDTO' karena dipakai untuk Create DAN Update
export class ProductSeoDTO {
  // ==========================================
  // BAHASA INDONESIA (ID)
  // ==========================================
  @IsOptional()
  @IsString()
  @MaxLength(70, { message: "Judul meta (ID) maksimal 70 karakter" })
  metaTitleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160, { message: "Deskripsi meta (ID) maksimal 160 karakter" })
  metaDescriptionId?: string;

  @IsOptional()
  @IsString()
  keywordsId?: string;

  @IsOptional()
  @IsUrl({}, { message: "Format Canonical URL (ID) tidak valid" })
  canonicalUrlId?: string;

  @IsOptional()
  @IsString()
  ogTitleId?: string;

  @IsOptional()
  @IsString()
  ogDescriptionId?: string;

  @IsOptional()
  @IsJSON({
    message: "Structured Data (ID) harus berupa format JSON yang valid",
  })
  structuredDataId?: string;

  // ==========================================
  // BAHASA INGGRIS (EN)
  // ==========================================
  @IsOptional()
  @IsString()
  @MaxLength(70, { message: "Judul meta (EN) maksimal 70 karakter" })
  metaTitleEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160, { message: "Deskripsi meta (EN) maksimal 160 karakter" })
  metaDescriptionEn?: string;

  @IsOptional()
  @IsString()
  keywordsEn?: string;

  @IsOptional()
  @IsUrl({}, { message: "Format Canonical URL (EN) tidak valid" })
  canonicalUrlEn?: string;

  @IsOptional()
  @IsString()
  ogTitleEn?: string;

  @IsOptional()
  @IsString()
  ogDescriptionEn?: string;

  @IsOptional()
  @IsJSON({
    message: "Structured Data (EN) harus berupa format JSON yang valid",
  })
  structuredDataEn?: string;

  // ==========================================
  // PROPERTI UNIVERSAL
  // ==========================================
  @IsOptional()
  @IsUrl({}, { message: "Format URL Gambar OG tidak valid" })
  ogImage?: string;
}
