import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class BatchPriceModifierDTO {
  @IsNotEmpty()
  @IsString()
  targetCurrency!: string;

  @IsNotEmpty()
  @IsNumber()
  newExchangeRate!: number;

  @IsOptional()
  @IsNumber()
  offsetValue?: number;

  @IsOptional()
  @IsString()
  offsetCurrency?: string;
}
