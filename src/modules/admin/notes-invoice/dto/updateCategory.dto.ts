import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateNoteCategoryDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
