import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

// === CREATE ===
export class CreateFaqDTO {
  @IsNotEmpty()
  @IsString()
  questionId!: string;

  @IsNotEmpty()
  @IsString()
  questionEn!: string;

  @IsNotEmpty()
  @IsString()
  answerId!: string;

  @IsNotEmpty()
  @IsString()
  answerEn!: string;

  // Penting: Relasi ke Category (FaqCategory masih menggunakan UUID)
  @IsNotEmpty()
  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// === UPDATE ===
export class UpdateFaqDTO {
  @IsOptional()
  @IsString()
  questionId?: string;

  @IsOptional()
  @IsString()
  questionEn?: string;

  @IsOptional()
  @IsString()
  answerId?: string;

  @IsOptional()
  @IsString()
  answerEn?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
