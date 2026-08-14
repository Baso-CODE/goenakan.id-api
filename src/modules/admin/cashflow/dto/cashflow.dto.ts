import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

// =================================================================
// 1. DTO UNTUK ITEM PEMASUKAN (REVENUE)
// =================================================================
export class CashflowRevenueInputDTO {
  @IsString()
  @IsNotEmpty({ message: "Deskripsi tidak boleh kosong" })
  description!: string;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsNumber()
  @Min(0, { message: "Harga unit tidak boleh kurang dari 0" })
  unitPrice!: number;

  @IsNumber()
  @Min(1, { message: "Kuantitas minimal 1" })
  quantity!: number;

  @IsNumber()
  @Min(0, { message: "Total tidak boleh kurang dari 0" })
  total!: number;

  @IsString()
  @IsOptional()
  currency?: string = "IDR";

  @IsNumber()
  @Min(0.000001, { message: "Nilai tukar minimal lebih dari 0" })
  @IsOptional()
  exchangeRate?: number = 1;

  // ✨ TAMBAHAN: Untuk mencatat kurs historis saat transaksi/save dilakukan
  @IsNumber()
  @Min(0.000001, { message: "Kurs historis minimal lebih dari 0" })
  @IsOptional()
  historicalExchangeRate?: number = 1;
}

// =================================================================
// 2. DTO UNTUK ITEM PENGELUARAN (COST)
// =================================================================
export class CashflowCostInputDTO {
  @IsBoolean()
  @IsOptional()
  isManual?: boolean = false;

  @IsString()
  @IsNotEmpty({ message: "Deskripsi tidak boleh kosong" })
  description!: string;

  @IsString()
  @IsOptional()
  vendorId?: string;

  @IsNumber()
  @Min(0, { message: "Biaya per unit tidak boleh kurang dari 0" })
  costPerUnit!: number;

  @IsNumber()
  @Min(1, { message: "Kuantitas minimal 1" })
  quantity!: number;

  @IsNumber()
  @Min(0, { message: "Total tidak boleh kurang dari 0" })
  total!: number;

  @IsString()
  @IsOptional()
  currency?: string = "IDR";

  @IsNumber()
  @Min(0.000001, { message: "Nilai tukar minimal lebih dari 0" })
  @IsOptional()
  exchangeRate?: number = 1;

  @IsNumber()
  @Min(0.000001, { message: "Kurs historis minimal lebih dari 0" })
  @IsOptional()
  historicalExchangeRate?: number = 1;
}

// =================================================================
// 3. DTO UTAMA UNTUK SAVE CASHFLOW
// =================================================================
export class SaveCashflowDTO {
  @IsString()
  @IsOptional()
  orderId?: string;

  @IsString()
  @IsOptional()
  replacementOrderId?: string;

  @IsString()
  @IsOptional()
  orderNumber?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashflowRevenueInputDTO)
  revenueItems!: CashflowRevenueInputDTO[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashflowCostInputDTO)
  costItems!: CashflowCostInputDTO[];
}
