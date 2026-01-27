import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateHeroSlideDTO {
  @IsNotEmpty()
  @IsString()
  title!: string;

  // Hapus @IsNotEmpty imageUrl karena ini ditangani via File Upload

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsString()
  ctaText?: string;

  @IsOptional()
  @IsString()
  ctaLink?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => Number(value))
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true" || value === true)
  isActive?: boolean;
}

export class UpdateHeroSlideDTO {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsString()
  ctaText?: string;

  @IsOptional()
  @IsString()
  ctaLink?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => Number(value))
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true" || value === true)
  isActive?: boolean;
}
