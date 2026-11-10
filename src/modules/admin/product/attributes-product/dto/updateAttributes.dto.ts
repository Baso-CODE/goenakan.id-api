import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

// =====================================================
// UPDATE ATTRIBUTE VALUE DTO
// =====================================================

export class UpdateAttributeValueDTO {
  // Ada ID = update
  // Tidak ada ID = create
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  value?: string;

  // English translation (manual / DeepL)
  @IsOptional()
  @IsString()
  value_en?: string;

  // True = delete value
  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  // Nested subattributes
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAttributeDTO)
  subAttributes?: UpdateAttributeDTO[];
}

// =====================================================
// UPDATE ATTRIBUTE DTO
// =====================================================

export class UpdateAttributeDTO {
  // Digunakan untuk nested attribute
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;

  // English translation (manual / DeepL)
  @IsOptional()
  @IsString()
  name_en?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  // Digunakan saat menghapus subattribute
  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAttributeValueDTO)
  values?: UpdateAttributeValueDTO[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  parentValueId?: string;
}
