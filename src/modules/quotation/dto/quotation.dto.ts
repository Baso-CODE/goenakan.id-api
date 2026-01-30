import { Type } from "class-transformer";
import {
  IsArray,
  IsDate,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { CreateQuotationItemDTO } from "./quotation-item.dto";

// === CREATE ===
export class CreateQuotationDTO {
  // === TANGGAL ===
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date; // Bisa backdate, default now() di service

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date; // Tanggal kadaluarsa

  // === HYBRID CLIENT ===
  // Note: Service nanti yang memvalidasi bahwa minimal SALAH SATU
  // dari clientId atau manualClientName harus terisi.

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  manualClientName?: string;

  @IsOptional()
  @IsString()
  manualClientCompany?: string;

  @IsOptional()
  @IsEmail()
  manualClientEmail?: string;

  @IsOptional()
  @IsString()
  manualClientPhone?: string;

  @IsOptional()
  @IsString()
  manualClientAddress?: string;

  // === ITEMS (ARRAY) ===
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDTO)
  items!: CreateQuotationItemDTO[];

  // === NOTES ===
  @IsOptional()
  @IsString()
  notes?: string; // Catatan untuk client

  @IsOptional()
  @IsString()
  internalNotes?: string; // Catatan internal
}

// === UPDATE ===
export class UpdateQuotationDTO {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;

  @IsOptional()
  @IsString()
  status?: string; // DRAFT, SENT, REJECTED, etc.

  // Update Client Info
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  manualClientName?: string;

  @IsOptional()
  @IsString()
  manualClientCompany?: string;

  @IsOptional()
  @IsEmail()
  manualClientEmail?: string;

  @IsOptional()
  @IsString()
  manualClientPhone?: string;

  @IsOptional()
  @IsString()
  manualClientAddress?: string;

  // Update Notes
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDTO)
  items?: CreateQuotationItemDTO[];
}
