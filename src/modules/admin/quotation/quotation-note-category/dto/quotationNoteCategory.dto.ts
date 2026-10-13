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

export class NoteTemplateDTO {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @IsNotEmpty({ message: "Judul template tidak boleh kosong" })
  title!: string;

  @IsString()
  @IsNotEmpty({ message: "Konten template tidak boleh kosong" })
  content!: string;
}

export class CreateQuotationNoteCategoryDTO {
  @IsString()
  @IsNotEmpty({ message: "Nama kategori wajib diisi" })
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

export class QuotationNoteInputDTO {
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  templateId?: string | null;

  @IsString()
  @IsNotEmpty()
  content!: string;
}

export class QuotationNotesArrayDTO {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationNoteInputDTO)
  notes!: QuotationNoteInputDTO[];
}
