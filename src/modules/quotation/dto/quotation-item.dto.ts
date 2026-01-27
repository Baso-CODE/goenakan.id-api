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
  // === HYBRID PRODUCT ===
  // Opsional: Jika user pilih dari database
  @IsOptional()
  @IsUUID()
  productId?: string;

  // Wajib: Nama produk (Snapshot).
  // Jika pilih DB, Frontend harus auto-fill ini dari data produk.
  // Jika manual, user ketik sendiri.
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
  discount?: number; // Diskon per item (opsional)

  // === LAINNYA ===
  @IsOptional()
  customization?: any; // JSON object untuk request custom (warna/size)

  @IsOptional()
  @IsString()
  remarks?: string;
}
