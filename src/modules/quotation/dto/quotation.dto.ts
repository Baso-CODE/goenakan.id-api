import { Type } from "class-transformer";
import {
  IsArray,
  IsDate,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { CreateQuotationItemDTO } from "./quotation-item.dto";

// ===============================================
// SUB-DTO: NOTE INPUT (Multi-Select Logic)
// ===============================================
export class QuotationNoteInputDTO {
  @IsNotEmpty()
  @IsUUID()
  categoryId!: string; // ID dari Master Category (e.g. "Terms", "Internal")

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contents!: string[]; // Array isi note: ["DP 50%", "Tempo 14 Hari"]
}

// ===============================================
// CREATE DTO
// ===============================================
export class CreateQuotationDTO {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;

  // === CLIENT INFO (Hybrid) ===
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

  // === NOTES (NEW STRUCTURE) ===
  // Menggantikan field string 'notes' & 'internalNotes' yang lama
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationNoteInputDTO)
  notes?: QuotationNoteInputDTO[];
}

// ===============================================
// UPDATE DTO
// ===============================================
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

  // Update Notes (NEW STRUCTURE)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationNoteInputDTO)
  notes?: QuotationNoteInputDTO[];

  // Update Items
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDTO)
  items?: CreateQuotationItemDTO[];
}
