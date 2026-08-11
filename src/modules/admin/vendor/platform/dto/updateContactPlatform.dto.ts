import { IsOptional, IsString, IsBoolean } from "class-validator";

export class UpdateContactPlatformDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
