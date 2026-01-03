import { IsNotEmpty, IsOptional, IsString, IsBoolean } from "class-validator";

export class CreateContactPlatformDTO {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
