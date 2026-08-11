import { IsOptional, IsString, MaxLength } from "class-validator";

export class ArticleSeoDTO {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  metaTitle?: string;

  @IsString()
  @IsOptional()
  metaDescription?: string;

  @IsString()
  @IsOptional()
  keywords?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  canonicalUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  ogTitle?: string;

  @IsString()
  @IsOptional()
  ogDescription?: string;

  @IsString()
  @IsOptional()
  ogImage?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  robots?: string;

  @IsString()
  @IsOptional()
  structuredData?: string;
}
