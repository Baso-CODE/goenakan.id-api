import { Type } from "class-transformer";
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export class SyncMockupAreaDto {
  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  x!: number;

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  y!: number;

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  width!: number;

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  height!: number;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  physicalWidth?: number | null;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  physicalHeight?: number | null;

  @IsString()
  @IsOptional()
  unit?: string;
}

export class SyncMockupPayloadDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncMockupAreaDto)
  mockupAreas!: SyncMockupAreaDto[];
}
