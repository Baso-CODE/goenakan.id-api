import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { CreateProductAttributeSelectionDTO } from "./createProductAttributesSelection.dto";

export class VariantImageMetadataDTO {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  variantIndex!: number;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean = false;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt({ message: "price must be an integer" })
  @Min(0, { message: "price cannot be negative" })
  price!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber({}, { message: "weight must be a valid number" })
  @Type(() => Number)
  @Min(0, { message: "weight cannot be negative" })
  weight?: number;

  @IsOptional()
  @IsNumber({}, { message: "width must be a valid number" })
  @Type(() => Number)
  @Min(0, { message: "width cannot be negative" })
  width?: number;

  @IsOptional()
  @IsNumber({}, { message: "height must be a valid number" })
  @Type(() => Number)
  @Min(0, { message: "height cannot be negative" })
  height?: number;

  @IsOptional()
  @IsNumber({}, { message: "length must be a valid number" })
  @Type(() => Number)
  @Min(0, { message: "length cannot be negative" })
  length?: number;
}

export class CreateProductAttributeDTO {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsString()
  value!: string;
}

export class CreatePriceTierDTO {
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  minQuantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  maxQuantity?: number;
  @IsNotEmpty()
  @Type(() => String)
  price!: string;
}

export class CreateProductImageDTO {
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean = false;

  @IsOptional()
  @IsString()
  altText?: string;
}

export class CreateProductVideoDTO {
  @IsString()
  @IsNotEmpty()
  url!: string;
  @IsString()
  @IsOptional()
  publicId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean = false;
}

export class CreateProductDTO {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsString()
  sku!: string;

  @IsNotEmpty()
  @IsString()
  description!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt({ message: "Base price must be an integer" })
  @Min(0, { message: "Base price cannot be negative" })
  basePrice!: number;

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
  @IsNumber({}, { message: "Height must be a valid number" })
  @Min(0)
  height?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "Length must be a valid number" })
  @Min(0)
  length?: number;

  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;

  @IsOptional()
  @IsString()
  materialType?: string;

  @IsNotEmpty()
  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: "Setiap tag harus berupa string ID" })
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductAttributeSelectionDTO)
  attributes: CreateProductAttributeSelectionDTO[] = [];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePriceTierDTO)
  priceTiers: CreatePriceTierDTO[] = [];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDTO)
  imagesMetadata: CreateProductImageDTO[] = [];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVideoDTO)
  videosMetadata: CreateProductVideoDTO[] = [];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantImageMetadataDTO)
  variantImagesMetadata: VariantImageMetadataDTO[] = [];

  @IsOptional()
  variantImages?: {
    variantIndex: number;
    isFeatured?: boolean;
    altText?: string;
  }[];
}
