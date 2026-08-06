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

export enum ShipmentType {
  INBOUND = "INBOUND",
  OUTBOUND = "OUTBOUND",
}

export enum ShippingMethod {
  LAND = "LAND",
  SEA = "SEA",
  AIR = "AIR",
}

export enum ShipmentStatusEnum {
  PENDING = "PENDING",
  PREPARED = "PREPARED",
  DISPATCHED = "DISPATCHED",
  IN_TRANSIT = "IN_TRANSIT",
  ARRIVED = "ARRIVED",
  CANCELLED = "CANCELLED",
}

// --- SUB-DTO: SHIPMENT NOTES ---
export class ShipmentNoteInputDTO {
  @IsNotEmpty()
  @IsUUID()
  categoryId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contents!: string[];
}

// --- SUB-DTO: DETAIL ITEM ---
export class ShipmentItemInputDTO {
  @IsNotEmpty()
  @IsUUID()
  orderProductId!: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  quantity!: number;
  @IsOptional()
  @IsInt()
  @Min(0)
  totalCarton?: number;
}

// --- MAIN DTO: CREATE SHIPMENT HEADER ---
export class CreateShipmentDTO {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  replacementOrderId?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsNotEmpty()
  @IsEnum(ShipmentType)
  type!: ShipmentType;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  step!: number;

  @IsNotEmpty()
  @IsEnum(ShippingMethod)
  method!: ShippingMethod;

  @IsNotEmpty()
  @IsString()
  origin!: string;

  @IsNotEmpty()
  @IsString()
  destination!: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  courierLink?: string;

  @IsNotEmpty()
  @IsDateString()
  departureDate!: string;

  @IsOptional()
  @IsDateString()
  arrivalDate?: string;
  // === ITEM YANG DIKIRIM ===
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentItemInputDTO)
  items!: ShipmentItemInputDTO[];

  // === INITIAL NOTES ===
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentNoteInputDTO)
  notes?: ShipmentNoteInputDTO[];
}
