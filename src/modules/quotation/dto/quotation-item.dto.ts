import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

const EmptyStringToUndefined = Transform(({ value }) =>
  value === "" || value === null ? undefined : value,
);

export class CreateQuotationItemDTO {
  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID()
  productId?: string;

  // 🔥 Tambah variantId untuk product custom
  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID()
  variantId?: string;

  @IsNotEmpty()
  @IsString()
  productName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice!: number;

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
