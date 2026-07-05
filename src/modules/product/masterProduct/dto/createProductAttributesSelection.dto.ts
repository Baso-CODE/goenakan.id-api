import { IsNotEmpty, IsString, IsArray, IsOptional } from "class-validator";

export class CreateProductAttributeSelectionDTO {
  @IsNotEmpty()
  @IsString()
  attributeId!: string;

  @IsArray()
  @IsString({ each: true })
  valueIds!: string[];

  @IsOptional()
  priceModifiers?: Record<string, number>;

  @IsOptional()
  isVariantGenerator?: boolean;
}
