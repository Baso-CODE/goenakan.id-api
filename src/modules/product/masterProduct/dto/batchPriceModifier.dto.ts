import { IsNotEmpty, IsNumber, IsOptional, IsString, IsArray } from "class-validator";

export class BatchPriceModifierDTO {
  @IsNotEmpty()
  @IsString()
  targetCurrency!: string;

  @IsNotEmpty()
  @IsNumber()
  exchangeRateDiff!: number;

  @IsOptional()
  @IsNumber()
  offsetValue?: number;

  @IsOptional()
  @IsString()
  offsetCurrency?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];
}
