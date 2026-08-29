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

  @IsOptional()
  selectedAttributes?: any; //  Tambahkan properti ini untuk menampung pilihan atribut user

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

  @IsOptional()
  selectedAttributes?: any; //  Tambahkan juga di sini jika ingin bisa di-update

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
