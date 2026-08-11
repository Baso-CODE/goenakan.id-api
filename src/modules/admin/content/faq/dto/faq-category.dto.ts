import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

// === CREATE ===
export class CreateFaqCategoryDTO {
  @IsNotEmpty()
  @IsString()
  nameId!: string;

  @IsNotEmpty()
  @IsString()
  nameEn!: string;

  @IsOptional()
  @IsString()
  descriptionId?: string;

  @IsOptional()
  @IsString()
  descriptionEn?: string;

  // Slug biasanya di-generate otomatis di backend,
  // tapi kita sediakan opsi jika admin ingin custom slug.
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number) // Memastikan input dikonversi jadi number
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// === UPDATE ===
export class UpdateFaqCategoryDTO {
  @IsOptional()
  @IsString()
  nameId?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  descriptionId?: string;

  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
