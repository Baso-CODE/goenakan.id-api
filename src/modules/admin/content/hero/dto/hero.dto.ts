import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

const parseBoolean = (value: unknown) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return value;
};

// =====================================================
// CREATE HERO SLIDE DTO
// =====================================================

export class CreateHeroSlideDTO {
  @IsString()
  @IsNotEmpty()
  titleId!: string;

  @IsOptional()
  @IsString()
  titleEn?: string;

  @IsOptional()
  @IsString()
  altTextId?: string;

  @IsOptional()
  @IsString()
  altTextEn?: string;

  @IsOptional()
  @IsString()
  ctaTextId?: string;

  @IsOptional()
  @IsString()
  ctaTextEn?: string;

  @IsOptional()
  @IsString()
  ctaLink?: string;

  @IsOptional()
  @Transform(({ value }) => (value === "" ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}

// =====================================================
// UPDATE HERO SLIDE DTO
// =====================================================

export class UpdateHeroSlideDTO {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  titleId?: string;

  @IsOptional()
  @IsString()
  titleEn?: string;

  @IsOptional()
  @IsString()
  altTextId?: string;

  @IsOptional()
  @IsString()
  altTextEn?: string;

  @IsOptional()
  @IsString()
  ctaTextId?: string;

  @IsOptional()
  @IsString()
  ctaTextEn?: string;

  @IsOptional()
  @IsString()
  ctaLink?: string;

  @IsOptional()
  @Transform(({ value }) => (value === "" ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}
