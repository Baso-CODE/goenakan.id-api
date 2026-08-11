import { Transform } from "class-transformer";
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from "class-validator";

// ==========================================
// CREATE CURRENCY DTO
// ==========================================
export class CreateCurrencyDTO {
  @IsNotEmpty({ message: "Code tidak boleh kosong" })
  @IsString()
  @Length(3, 5, {
    message: "Code harus antara 3-5 karakter (contoh: IDR, USD)",
  })
  @Transform(({ value }) => value?.toUpperCase().trim())
  code!: string;

  @IsNotEmpty({ message: "Symbol tidak boleh kosong" })
  @IsString()
  symbol!: string;

  @IsNotEmpty({ message: "Name tidak boleh kosong" })
  @IsString()
  name!: string;
}

// ==========================================
// UPDATE CURRENCY DTO
// ==========================================
export class UpdateCurrencyDTO {
  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class ConvertCurrencyDTO {
  @IsString({ message: "fromCurrency harus berupa string (e.g., 'IDR')" })
  fromCurrency?: string;

  @IsString({ message: "toCurrency harus berupa string (e.g., 'EUR')" })
  toCurrency?: string;

  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: "amount harus berupa angka valid" },
  )
  @Min(0, { message: "amount minimal 0" })
  amount?: number;
}
export interface ConversionResult {
  success: boolean;
  fromCurrency: string;
  toCurrency: string;
  originalAmount: number;
  convertedAmount: number;
  rate: number;
  timestamp: string;
  source: string;
}
