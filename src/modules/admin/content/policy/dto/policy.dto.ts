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
export class CreatePolicyDTO {
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

  // Penting: Relasi ke Category
  @IsNotEmpty()
  @IsInt() // Karena id PolicyCategory sekarang menggunakan Integer
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

// === UPDATE ===
export class UpdatePolicyDTO {
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
