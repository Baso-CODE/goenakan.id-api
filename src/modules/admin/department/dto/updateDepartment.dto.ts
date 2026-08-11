import { IsOptional, IsString, IsBoolean } from "class-validator";

export class UpdateDepartmentDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
