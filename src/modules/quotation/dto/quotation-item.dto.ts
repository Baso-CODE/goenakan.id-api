import { Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class CreateQuotationItemDTO {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsNotEmpty()
  @IsString()
  productName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  // === PERHITUNGAN ===
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
