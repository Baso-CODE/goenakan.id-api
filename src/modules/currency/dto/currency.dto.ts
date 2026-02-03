import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, Length } from "class-validator";

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
