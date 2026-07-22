import {
  IsDecimal,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateVendorPriceRecordDTO {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  tempProductName?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  calculationMode?: string;

  @IsOptional()
  tiers?: any;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  serviceVendorId?: string;

  @IsOptional()
  @IsString()
  supplierPlatform?: string;

  @IsOptional()
  @IsString()
  supplierContactName?: string;

  @IsOptional()
  @IsString()
  supplierContactLink?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imagePublicId?: string;

  @IsNotEmpty({ message: "Harga supplier tidak boleh kosong" })
  @IsNumber()
  @Min(0)
  foreignPrice!: number;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsNotEmpty({ message: "Exchange rate tidak boleh kosong" })
  @IsNumber()
  @Min(0)
  exchangeRate!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  qtyPerCtn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  length?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gzDeliveryCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  localFreight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  seaFreightRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  airFreightRate?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  moqCtn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  margin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sponsorPercent?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateVendorPriceRecordDTO {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  tempProductName?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  calculationMode?: string;

  @IsOptional()
  tiers?: any;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  serviceVendorId?: string;

  @IsOptional()
  @IsString()
  supplierPlatform?: string;

  @IsOptional()
  @IsString()
  supplierContactName?: string;

  @IsOptional()
  @IsString()
  supplierContactLink?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imagePublicId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  foreignPrice?: number;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  qtyPerCtn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  length?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gzDeliveryCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  localFreight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  seaFreightRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  airFreightRate?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  moqCtn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  margin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sponsorPercent?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
