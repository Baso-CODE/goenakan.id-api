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
  weights?: Record<string, number>;

  @IsOptional()
  widths?: Record<string, number>;

  @IsOptional()
  heights?: Record<string, number>;

  @IsOptional()
  lengths?: Record<string, number>;

  @IsOptional()
  isVariantGenerator?: boolean;
}
