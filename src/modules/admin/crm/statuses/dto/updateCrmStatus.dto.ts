import { IsBoolean, IsInt, IsOptional, IsString } from "class-validator";

export class UpdateCrmStatusDTO {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isWon?: boolean;

  @IsOptional()
  @IsBoolean()
  isLost?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}
