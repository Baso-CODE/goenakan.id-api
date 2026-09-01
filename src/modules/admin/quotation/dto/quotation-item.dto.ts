import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

const EmptyStringToUndefined = Transform(({ value }) =>
  value === "" || value === null ? undefined : value,
);

export class QuotationItemTierDTO {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  minQuantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxQuantity?: number;

  @IsOptional()
  @IsString()
  quantityLabel?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  unitPrice!: number;
}

export class CreateQuotationItemDTO {
  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID()
  productId?: string;

  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsObject()
  selectedAttributes?: Record<string, any>;

  @IsNotEmpty()
  @IsString()
  productName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  quantityLabel?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemTierDTO)
  tiers?: QuotationItemTierDTO[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discount?: number;

  @IsOptional()
  customization?: any;

  @IsOptional()
  @IsString()
  remarks?: string;
}
