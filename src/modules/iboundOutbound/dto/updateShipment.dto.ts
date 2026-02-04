import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";

// Kita gunakan kembali Sub-DTO Notes agar konsisten
export class ShipmentNoteInputDTO {
  @IsNotEmpty()
  @IsUUID()
  categoryId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contents!: string[];
}

// === DTO UNTUK MARK ARRIVED ===
export class MarkShipmentArrivedDTO {
  @IsNotEmpty()
  @IsDateString()
  arrivalDate!: string;

  // Ganti remarks string ke terstruktur notes
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentNoteInputDTO)
  notes?: ShipmentNoteInputDTO[];
}

// === DTO UNTUK EDIT INFO (TYPO RESI, DLL) ===
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

  // Ganti remarks string ke terstruktur notes
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentNoteInputDTO)
  notes?: ShipmentNoteInputDTO[];
}
