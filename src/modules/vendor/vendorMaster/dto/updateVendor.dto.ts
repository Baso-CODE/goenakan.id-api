import { Type } from "class-transformer";
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsUUID,
  ArrayNotEmpty,
  IsNotEmpty,
  ValidateNested,
} from "class-validator";
import { VendorContactDTO } from "./createVendor.dto";

export class UpdateVendorDTO {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  picName?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  subDistrict?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  @ArrayNotEmpty()
  itemIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorContactDTO)
  contacts?: VendorContactDTO[];
}
