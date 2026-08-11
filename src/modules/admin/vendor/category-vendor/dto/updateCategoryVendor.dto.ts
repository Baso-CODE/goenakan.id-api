import {
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  IsNotEmpty,
} from "class-validator";
import { VendorType } from "@prisma/client";

export class UpdateVendorCategoryDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(VendorType)
  type?: VendorType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
