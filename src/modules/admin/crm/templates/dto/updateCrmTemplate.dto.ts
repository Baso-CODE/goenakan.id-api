import { IsOptional, IsString } from "class-validator";

export class UpdateCrmTemplateDTO {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  shortcut?: string;
}
