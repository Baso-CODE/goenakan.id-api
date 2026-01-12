import { IsBoolean, IsOptional, IsString, IsUUID } from "class-validator";

export class UpdateNoteTemplateDTO {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
