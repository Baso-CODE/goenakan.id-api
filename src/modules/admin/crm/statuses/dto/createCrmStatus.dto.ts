import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateCrmStatusDTO {
  @IsNotEmpty({ message: "Label nama status tidak boleh kosong" })
  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  key?: string;

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
}
