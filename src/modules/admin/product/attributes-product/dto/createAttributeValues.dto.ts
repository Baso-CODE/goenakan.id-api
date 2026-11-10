import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateAttributeValueDTO {
  @IsNotEmpty()
  @IsString()
  value!: string;

  @IsOptional()
  @IsString()
  value_en?: string;

  @IsNotEmpty()
  @IsString()
  attributeId!: string;
}
