import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateBestPriceGuaranteeDTO {
  @IsNotEmpty()
  @IsString()
  titleId!: string;

  @IsNotEmpty()
  @IsString()
  titleEn!: string;

  @IsNotEmpty()
  @IsString()
  contentId!: string;

  @IsNotEmpty()
  @IsString()
  contentEn!: string;

  // Relasi ke Category
  @IsNotEmpty()
  @IsInt()
  @Type(() => Number)
  categoryId!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBestPriceGuaranteeDTO {
  @IsOptional()
  @IsString()
  titleId?: string;

  @IsOptional()
  @IsString()
  titleEn?: string;

  @IsOptional()
  @IsString()
  contentId?: string;

  @IsOptional()
  @IsString()
  contentEn?: string;

  // Relasi ke Category
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  categoryId?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
