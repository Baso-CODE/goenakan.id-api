import { IsOptional, IsString } from "class-validator";

export class UpdateCrmLabelDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
