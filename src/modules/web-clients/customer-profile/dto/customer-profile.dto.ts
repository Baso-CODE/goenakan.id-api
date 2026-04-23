// src/modules/customer-profile/dto/customer-profile.dto.ts
import { AccountType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateCustomerProfileDTO {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(AccountType)
  @IsOptional()
  accountType?: AccountType;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  picName?: string;

  @IsString()
  @IsOptional()
  picPhone?: string;

  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

export class CreateCustomerProfileDTO extends UpdateCustomerProfileDTO {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
