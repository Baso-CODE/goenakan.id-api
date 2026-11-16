import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateCustomCodeDTO {
  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  leadUrlRef?: string;

  @IsString()
  @IsOptional()
  assignedUserId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
