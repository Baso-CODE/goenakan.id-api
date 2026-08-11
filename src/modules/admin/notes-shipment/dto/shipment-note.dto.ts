import { Type } from "class-transformer";
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export class NoteTemplateDTO {
  @IsNotEmpty({ message: "Title template tidak boleh kosong" })
  @IsString()
  title!: string;

  @IsNotEmpty({ message: "Content template tidak boleh kosong" })
  @IsString()
  content!: string;
}

// --- DTO: Create Category ---
export class CreateShipmentNoteCategoryDTO {
  @IsNotEmpty({ message: "Nama kategori wajib diisi" })
  @IsString()
  name!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoteTemplateDTO)
  templates?: NoteTemplateDTO[];
}

// --- DTO: Update Category ---
export class UpdateShipmentNoteCategoryDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoteTemplateDTO)
  templates?: NoteTemplateDTO[];
}
