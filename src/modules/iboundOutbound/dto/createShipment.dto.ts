import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

// Enum harus sama dengan di Prisma Schema
export enum ShipmentType {
  INBOUND = "INBOUND",
  OUTBOUND = "OUTBOUND",
}

export enum ShippingMethod {
  LAND = "LAND",
  SEA = "SEA",
  AIR = "AIR",
}

// --- SUB-DTO: DETAIL ITEM (PARTIAL SHIPMENT LOGIC) ---
export class ShipmentItemInputDTO {
  @IsNotEmpty()
  @IsUUID()
  orderProductId!: string; // ID Produk dari Order

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  quantity!: number; // Admin input: Berapa qty yang dikirim di resi ini?
}

// --- MAIN DTO: CREATE SHIPMENT HEADER ---
export class CreateShipmentDTO {
  @IsNotEmpty()
  @IsUUID()
  orderId!: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string; // ID Ekspedisi (JNE, Cargo, dll). Optional jika pakai kurir sendiri.

  @IsNotEmpty()
  @IsEnum(ShipmentType)
  type!: ShipmentType; // INBOUND atau OUTBOUND

  @IsNotEmpty()
  @IsEnum(ShippingMethod)
  method!: ShippingMethod; // LAND, SEA, AIR

  // === INFORMASI TRACKING ===
  @IsOptional()
  @IsString()
  trackingNumber?: string; // No. Resi

  @IsOptional()
  @IsString()
  // @IsUrl() // Boleh dinyalakan jika admin wajib input link valid
  courierLink?: string; // Link cek resi

  // === RUTE (PENTING UNTUK MULTI-LEG) ===
  @IsOptional()
  @IsString()
  origin?: string; // e.g. "Gudang Guangzhou"

  @IsOptional()
  @IsString()
  destination?: string; // e.g. "Gudang Jakarta"

  // === WAKTU ===
  @IsNotEmpty()
  @IsDateString()
  departureDate!: string; // Input Admin: Kapan barang jalan?

  @IsOptional()
  @IsString()
  remarks?: string;

  // === ITEM YANG DIKIRIM (ARRAY) ===
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentItemInputDTO)
  items!: ShipmentItemInputDTO[];
}
