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
import { ShipmentNoteInputDTO } from "./createShipment.dto"; // Import dari file sebelah

// 🔄 UPDATE: Status Enum disesuaikan dengan skema database terbaru
export enum ShipmentStatus {
  PENDING = "PENDING",
  PREPARED = "PREPARED",
  DISPATCHED = "DISPATCHED",
  ARRIVED = "ARRIVED",
  CANCELLED = "CANCELLED",
}

// === DTO UTAMA: MENAMBAH HISTORY / STEP BARU ===
export class AddShipmentHistoryDTO {
  @IsNotEmpty()
  // 🔄 UPDATE: Sekarang hanya akan menerima 5 status dari enum baru di atas
  @IsEnum(ShipmentStatus, {
    message:
      "Status tidak valid. Gunakan PENDING, PREPARED, DISPATCHED, ARRIVED, atau CANCELLED.",
  })
  status!: ShipmentStatus;

  @IsNotEmpty()
  @IsDateString()
  date!: string; // Tanggal kejadian

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

// === DTO UNTUK EDIT INFO HEADER (TYPO RESI, DLL) ===
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
