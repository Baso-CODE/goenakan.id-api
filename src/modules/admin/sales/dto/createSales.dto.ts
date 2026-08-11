import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateSalesBankDTO {
  @IsNotEmpty()
  @IsString()
  bankName!: string;

  @IsNotEmpty()
  @IsString()
  accountNumber!: string;

  @IsNotEmpty()
  @IsString()
  accountHolderName!: string;
}

// --- DTO Utama untuk Create Sales ---
export class CreateSalesDTO {
  @IsNotEmpty()
  @IsString()
  prefix!: string; // Contoh: Bpk, Ibu

  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  signatureUrl?: string;

  @IsOptional()
  @IsString()
  signaturePublicId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesBankDTO)
  bankAccounts?: CreateSalesBankDTO[];
}
