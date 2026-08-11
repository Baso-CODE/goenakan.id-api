import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";

export class VendorContactDTO {
  @IsNotEmpty()
  @IsUUID()
  platformId!: string;

  @IsNotEmpty()
  @IsString()
  contactId!: string;
}

export class CreateVendorDTO {
  @IsNotEmpty()
  @IsString()
  companyName!: string;

  @IsNotEmpty()
  @IsString()
  picName!: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(["SERVICE", "PRODUCT"])
  type!: string;

  @IsNotEmpty()
  @IsUUID()
  categoryId!: string;

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
