import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export enum ClientType {
  B2B = "B2B",
  B2C = "B2C",
}

// ============================
// PIC STRUCTURE
// ============================
export class CreatePICDTO {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

// ============================
// MAIN CLIENT DTO
// ============================
export class CreateClientDTO {
  @IsEnum(ClientType)
  type!: ClientType;

  // COMMON
  @IsOptional()
  @IsString()
  custCode?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString(
    {},
    {
      message:
        "Format tanggal joinedDate tidak valid (Gunakan format YYYY-MM-DD)",
    },
  )
  joinedDate?: string;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsOptional()
  @IsString()
  brandWebsiteUrl?: string;

  @IsOptional()
  @IsString()
  brandCountry?: string;
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
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  // B2B ADDRESS
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

  // MULTIPLE PIC
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePICDTO)
  pics?: CreatePICDTO[];

  // ============================
  // B2C FIELDS
  // ============================
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  prefix?: string;

  // B2C ADDRESS
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

  @IsOptional()
  @IsString()
  purchaseChannelIdB2C?: string;
}
