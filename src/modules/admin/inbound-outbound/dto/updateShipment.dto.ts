import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { ShipmentNoteInputDTO } from "./createShipment.dto";

export enum ShipmentStatus {
  PENDING = "PENDING",
  PREPARED = "PREPARED",
  DISPATCHED = "DISPATCHED",
  IN_TRANSIT = "IN_TRANSIT",
  ARRIVED = "ARRIVED",
  CANCELLED = "CANCELLED",
}

// === DTO UTAMA: MENAMBAH HISTORY / STEP BARU ===
export class AddShipmentHistoryDTO {
  @IsNotEmpty()
  @IsEnum(ShipmentStatus, {
    message:
      "Status tidak valid. Gunakan PENDING, PREPARED, DISPATCHED, IN_TRANSIT, ARRIVED, atau CANCELLED.",
  })
  status!: ShipmentStatus;

  @IsNotEmpty()
  @IsDateString()
  date!: string;

  @IsNotEmpty()
  @IsString()
  city!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentNoteInputDTO)
  shipmentNotes?: ShipmentNoteInputDTO[];

  @IsOptional()
  @IsString()
  trackingNumber?: string;
}

// === DTO UNTUK EDIT INFO HEADER ===
export class UpdateShipmentInfoDTO {
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  courierLink?: string;

  @IsOptional()
  @IsString()
  deliveryNoteNumber?: string;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  destination?: string;
}
