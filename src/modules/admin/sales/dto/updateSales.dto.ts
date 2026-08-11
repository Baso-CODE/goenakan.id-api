import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { CreateSalesBankDTO } from "./createSales.dto";
import { Type } from "class-transformer";

// --- DTO untuk Update Sales ---
export class UpdateSalesDTO {
  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

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

export type UpdateCoreData = Omit<UpdateSalesDTO, "bankAccounts">;
