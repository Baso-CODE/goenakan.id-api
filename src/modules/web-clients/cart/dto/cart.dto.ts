import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class AddToCartDTO {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsOptional()
  variantId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  customization?: any; // Bisa berupa JSON Object

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateCartItemDTO {
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @IsOptional()
  customization?: any;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class SyncCartDTO {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddToCartDTO)
  items!: AddToCartDTO[];
}
