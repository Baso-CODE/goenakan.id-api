import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

// DTO untuk menandai barang SAMPAI (ARRIVED)
export class MarkShipmentArrivedDTO {
  @IsNotEmpty()
  @IsDateString()
  arrivalDate!: string; // Input Admin: Kapan sampainya?

  @IsOptional()
  @IsString()
  remarks?: string; // e.g. "Diterima oleh Pak Satpam"
}

// DTO untuk Edit Data (Kalau admin typo resi/link)
export class UpdateShipmentInfoDTO {
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  courierLink?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
