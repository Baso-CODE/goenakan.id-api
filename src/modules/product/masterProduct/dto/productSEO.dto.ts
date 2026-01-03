import {
  IsString,
  IsOptional,
  IsUrl,
  MaxLength,
  IsJSON,
} from "class-validator";

// Kita namakan 'ProductSeoDTO' karena dipakai untuk Create DAN Update
export class ProductSeoDTO {
  // Field ini Optional, karena saat Create pun user mungkin tidak mengisi ini
  @IsOptional()
  @IsString()
  @MaxLength(70)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  metaDescription?: string;

  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsUrl()
  canonicalUrl?: string;

  @IsOptional()
  @IsString()
  ogTitle?: string;

  @IsOptional()
  @IsString()
  ogDescription?: string;

  @IsOptional()
  @IsUrl()
  ogImage?: string;

  @IsOptional()
  @IsJSON()
  structuredData?: string;
}
