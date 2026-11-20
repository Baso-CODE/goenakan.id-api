import { CrmCustomCodeType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateCustomCodeDTO {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsEnum(CrmCustomCodeType)
  type!: CrmCustomCodeType;

  @IsString()
  @IsOptional()
  channel?: string;

  @IsString()
  @IsOptional()
  leadUrlRef?: string;

  @IsString()
  @IsOptional()
  assignedUserId?: string;
}
