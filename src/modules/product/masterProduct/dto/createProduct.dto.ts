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
  @IsInt({ message: "Weight must be an integer (grams)" })
  @Min(0)
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Width must be an integer (cm)" })
  @Min(0)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Height must be an integer (cm)" })
  @Min(0)
  height?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Length must be an integer (cm)" })
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
