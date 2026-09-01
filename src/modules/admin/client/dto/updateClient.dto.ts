import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { ClientType } from "./createClient.dto";

// ============================
// UPDATE PIC DTO
// ============================
export class UpdatePICDTO {
  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

// ============================
// UPDATE CLIENT DTO
// ============================
export class UpdateClientDTO {
  @IsOptional()
  @IsEnum(ClientType)
  type?: ClientType;

  // ============================
  // COMMON
  // ============================
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsOptional()
  @IsString()
  brandWebsiteUrl?: string;

  @IsOptional()
  @IsString()
  brandCountry?: string;

  @IsOptional()
  @IsDateString(
    {},
    {
      message:
        "Format tanggal joinedDate tidak valid (Gunakan format YYYY-MM-DD)",
    },
  )
  joinedDate?: string;

  // ============================
  // B2B FIELDS
  // ============================
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  // --- B2B Address ---
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
  fullAddress?: string;

  // --- UPDATE MULTIPLE PIC ---
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePICDTO)
  pics?: UpdatePICDTO[];

  // ============================
  // B2C FIELDS
  // ============================
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  prefix?: string; // B2C prefix

  // --- B2C Address ---
  @IsOptional()
  @IsString()
  countryB2C?: string;

  @IsOptional()
  @IsString()
  provinceB2C?: string;

  @IsOptional()
  @IsString()
  cityB2C?: string;

  @IsOptional()
  @IsString()
  districtB2C?: string;

  @IsOptional()
  @IsString()
  subDistrictB2C?: string;

  @IsOptional()
  @IsString()
  postalCodeB2C?: string;

  @IsOptional()
  @IsString()
  fullAddressB2C?: string;
}
