import {
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";

export class UpdateAttributeValueDTO {
  @IsOptional()
  @IsString()
  id?: string; // jika ada → update, jika tidak ada → create

  @IsString()
  value!: string;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean; // true → hapus value

  @IsOptional()
  position?: number;
}

export class UpdateAttributeDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAttributeValueDTO)
  values?: UpdateAttributeValueDTO[];

  @IsOptional()
  position?: number;
}
