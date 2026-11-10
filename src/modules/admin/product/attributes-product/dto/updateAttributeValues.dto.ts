import { IsOptional, IsString } from "class-validator";

export class UpdateAttributeValueDTO {
  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  value_en?: string;

  @IsOptional()
  @IsString()
  attributeId?: string;
}
