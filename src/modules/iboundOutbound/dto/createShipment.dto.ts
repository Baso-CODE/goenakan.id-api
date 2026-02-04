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

// --- SUB-DTO: SHIPMENT NOTES (Multi-content logic) ---
export class ShipmentNoteInputDTO {
  @IsNotEmpty()
  @IsUUID()
  categoryId!: string; // ID Kategori dari tabel ShipmentNoteCategory

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contents!: string[]; // Array string untuk menampung banyak pilihan template/manual
}

// --- SUB-DTO: DETAIL ITEM (PARTIAL SHIPMENT LOGIC) ---
export class ShipmentItemInputDTO {
  @IsNotEmpty()
  @IsUUID()
  orderProductId!: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  quantity!: number;
}

// --- MAIN DTO: CREATE SHIPMENT HEADER ---
export class CreateShipmentDTO {
  @IsNotEmpty()
  @IsUUID()
  orderId!: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsNotEmpty()
  @IsEnum(ShipmentType)
  type!: ShipmentType;

  @IsNotEmpty()
  @IsEnum(ShippingMethod)
  method!: ShippingMethod;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  courierLink?: string;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsNotEmpty()
  @IsDateString()
  departureDate!: string;

  @IsOptional()
  @IsString()
  deliveryNoteNumber?: string;

  // === ITEM YANG DIKIRIM (ARRAY) ===
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentItemInputDTO)
  items!: ShipmentItemInputDTO[];

  // === SHIPMENT NOTES (ARRAY OF CATEGORIES WITH CONTENTS) ===
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentNoteInputDTO)
  notes?: ShipmentNoteInputDTO[]; // Pengganti remarks
}
