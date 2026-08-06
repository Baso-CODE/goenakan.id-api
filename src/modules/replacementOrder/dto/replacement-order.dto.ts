import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

// Constraint untuk validasi harga (Sama seperti di contohmu)
@ValidatorConstraint({ name: "isValidPrice", async: false })
export class IsValidPriceConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    if (value === null || value === undefined) {
      return false;
    }
    const price = Number(value);
    if (isNaN(price) || price < 0) {
      return false;
    }
    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return "price must be a number >= 0";
  }
}

// === DTO UNTUK ITEM PRODUK YANG DIGANTI ===
export class ReplacementOrderProductDTO {
  @IsString({ message: "Product ID harus berupa teks" })
  @IsNotEmpty({ message: "Product ID tidak boleh kosong" })
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsNumber({}, { message: "Quantity harus berupa angka" })
  @IsNotEmpty({ message: "Quantity tidak boleh kosong" })
  quantity!: number;

  @IsOptional()
  @IsNumber(
    { allowInfinity: false, allowNaN: false },
    { message: "Unit price harus berupa angka yang valid" },
  )
  @Validate(IsValidPriceConstraint, {
    message: "Unit price harus berupa angka >= 0",
  })
  unitPrice?: number;

  @IsOptional()
  @IsObject({
    message: "selectedAttributes harus berupa objek JSON yang valid",
  })
  selectedAttributes?: Record<string, any>;

  // Menyimpan data kustomisasi, bisa berupa string JSON
  @IsOptional()
  @IsString()
  customization?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

// === DTO UTAMA UNTUK MEMBUAT REPLACEMENT ORDER ===
export class CreateReplacementOrderDTO {
  @IsString({ message: "Reference Order ID harus berupa teks" })
  @IsNotEmpty({ message: "Reference Order ID tidak boleh kosong" })
  referenceOrderId!: string;

  @IsString({ message: "Client ID harus berupa teks" })
  @IsNotEmpty({ message: "Client ID tidak boleh kosong" })
  clientId!: string;

  @IsOptional()
  @IsString()
  clientB2BPICId?: string;

  @IsString({ message: "Replacement Reason harus diisi" })
  @IsNotEmpty({
    message: "Alasan penggantian (Replacement Reason) tidak boleh kosong",
  })
  replacementReason!: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  // Tanggal pengiriman dan kedatangan biasanya diupdate belakangan, tapi kita sediakan jika ingin diisi di awal
  @IsOptional()
  @IsDateString(
    {},
    { message: "Format tanggal Send to Cust tidak valid (Gunakan ISO 8601)" },
  )
  sendToCustDate?: string;

  @IsOptional()
  @IsDateString(
    {},
    {
      message: "Format tanggal Arrival in Cust tidak valid (Gunakan ISO 8601)",
    },
  )
  arrivalInCustDate?: string;

  // Validasi Array of Object (Barang yang diganti)
  @IsArray({ message: "Items harus berupa sebuah array" })
  @ValidateNested({ each: true })
  @Type(() => ReplacementOrderProductDTO)
  items!: ReplacementOrderProductDTO[];
}

// === DTO UNTUK UPDATE REPLACEMENT ORDER ===
export class UpdateReplacementOrderDTO {
  @IsOptional()
  @IsString()
  replacementReason?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: "Format tanggal tidak valid (Gunakan ISO 8601)" },
  )
  sendToCustDate?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: "Format tanggal tidak valid (Gunakan ISO 8601)" },
  )
  arrivalInCustDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReplacementOrderProductDTO)
  items?: ReplacementOrderProductDTO[];
}
