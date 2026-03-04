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

// Status Enum yang GENERAL (Tidak menyebut nama negara)
export enum ShipmentStatus {
  DISPATCHED = "DISPATCHED", // Baru dibuat/berangkat
  ARRIVED_ORIGIN_WAREHOUSE = "ARRIVED_ORIGIN_WAREHOUSE", // Sampai gudang luar negeri (China/Jepang/dll)
  DEPARTED_ORIGIN = "DEPARTED_ORIGIN", // Meninggalkan negara asal
  IN_TRANSIT = "IN_TRANSIT", // Di perjalanan (Laut/Udara)
  AT_CUSTOMS = "AT_CUSTOMS", // Di Bea Cukai (Negara Tujuan)
  RELEASED_FROM_CUSTOMS = "RELEASED_FROM_CUSTOMS", // Lolos Bea Cukai
  ARRIVED_DESTINATION = "ARRIVED_DESTINATION", // Sampai Gudang Kita (Final)
  COMPLETED = "COMPLETED", // Selesai
  CANCELLED = "CANCELLED",
}

// === DTO UTAMA: MENAMBAH HISTORY / STEP BARU ===
export class AddShipmentHistoryDTO {
  @IsNotEmpty()
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;
  // Contoh value: AT_CUSTOMS, ARRIVED_ORIGIN_WAREHOUSE

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
