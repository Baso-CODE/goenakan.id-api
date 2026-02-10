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
// Dipakai untuk semua tahapan: Bea Cukai, Gudang, dll.
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
  // INI KUNCINYA:
  // Admin bisa input manual: "Guangzhou", "Osaka", "Soekarno-Hatta", "Tanjung Priok".
  // Jadi tidak terpaku pada "China".

  @IsOptional()
  @IsString()
  note?: string; // Catatan singkat manual (cth: "Kena red line", "Pending clearance")

  // Jika ingin menambah formal notes (template) pada step ini
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentNoteInputDTO)
  shipmentNotes?: ShipmentNoteInputDTO[];
}

// === DTO UNTUK EDIT INFO HEADER (TYPO RESI, DLL) ===
// Ini hanya untuk edit data header, bukan update status perjalanan
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
