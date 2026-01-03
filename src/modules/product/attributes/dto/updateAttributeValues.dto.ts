import { IsOptional, IsString } from "class-validator";

export class UpdateAttributeValueDTO {
  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  attributeId?: string;
}
