import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class CreateProductionDTO {
  @IsNotEmpty()
  @IsUUID()
  orderId!: string;

  @IsNotEmpty()
  @IsUUID()
  orderProductId!: string; // ID Barang spesifik dari order

  @IsNotEmpty()
  @IsUUID()
  vendorId!: string; // ID Pabrik (Vendor type PRODUCT)

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  step!: number;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  quantity!: number; // Jumlah yang diproduksi

  @IsNotEmpty()
  @IsDateString()
  startDate!: string; // Input Admin: Kapan mulai produksi (Format YYYY-MM-DD)

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CompleteProductionDTO {
  @IsNotEmpty()
  @IsDateString()
  endDate!: string; // Input Admin: Kapan selesai

  @IsOptional()
  @IsString()
  remarks?: string;
}
