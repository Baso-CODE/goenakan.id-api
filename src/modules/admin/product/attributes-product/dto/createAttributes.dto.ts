import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

// =====================================================
// CREATE ATTRIBUTE VALUE DTO
// =====================================================

export class CreateAttributeValueDTO {
  @IsNotEmpty()
  @IsString()
  value!: string;

  // English translation (manual / DeepL)
  @IsOptional()
  @IsString()
  value_en?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  // Nested attributes
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAttributeDTO)
  subAttributes?: CreateAttributeDTO[];
}

// =====================================================
// CREATE ATTRIBUTE DTO
// =====================================================

export class CreateAttributeDTO {
  @IsNotEmpty()
  @IsString()
  name!: string;

  // English translation (manual / DeepL)
  @IsOptional()
  @IsString()
  name_en?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAttributeValueDTO)
  values!: CreateAttributeValueDTO[];

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  parentValueId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}
