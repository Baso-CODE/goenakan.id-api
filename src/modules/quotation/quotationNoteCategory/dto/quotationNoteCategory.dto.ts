import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";

// ===============================================
// 1. SUB-DTO: TEMPLATE STRUKTUR (Untuk JSON)
// ===============================================

export class NoteTemplateDTO {
  @IsNotEmpty({ message: "Judul template tidak boleh kosong" })
  @IsString()
  title!: string;

  @IsNotEmpty({ message: "Konten template tidak boleh kosong" })
  @IsString()
  content!: string;
}

// ===============================================
// 2. MASTER DATA: CREATE CATEGORY
// ===============================================
export class CreateQuotationNoteCategoryDTO {
  @IsNotEmpty({ message: "Nama kategori wajib diisi" })
  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoteTemplateDTO)
  templates?: NoteTemplateDTO[];
}

// ===============================================
// 3. MASTER DATA: UPDATE CATEGORY
// ===============================================
export class UpdateQuotationNoteCategoryDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoteTemplateDTO)
  templates?: NoteTemplateDTO[];
}

// ===============================================
// 4. TRANSACTION: INPUT NOTES (Untuk Create/Update Quotation)
// ===============================================

export class QuotationNoteInputDTO {
  @IsNotEmpty()
  @IsUUID()
  categoryId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contents!: string[];
}
