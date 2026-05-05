import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class UpdateProductCoreDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsNumber()
  basePrice?: number;

  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;

  @IsOptional()
  @IsString()
  materialTypeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  @IsOptional()
  itemCategoryId?: string;

  @IsString()
  @IsOptional()
  itemNameId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: "Setiap tag harus berupa string ID" })
  tagIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "Weight must be a valid number" })
  @Min(0)
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "Width must be a valid number" })
  @Min(0)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "Height must be a valid number" }) // 🔥
  @Min(0)
  height?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "Length must be a valid number" })
  @Min(0)
  length?: number;
}
