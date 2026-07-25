import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
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
  @IsIn(["SERVICE", "PRODUCT"])
  type?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

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
  @IsString()
  trackingUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorContactDTO)
  contacts?: VendorContactDTO[];
}
