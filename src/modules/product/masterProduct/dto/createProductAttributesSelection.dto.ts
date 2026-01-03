import { IsNotEmpty, IsString, IsArray } from "class-validator";

export class CreateProductAttributeSelectionDTO {
  @IsNotEmpty()
  @IsString()
  attributeId!: string;

  @IsArray()
  @IsString({ each: true })
  valueIds!: string[];
}
