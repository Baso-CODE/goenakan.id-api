import { PaymentMethod, TransactionType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateFinanceTransactionDTO {
  @IsDateString(
    {},
    { message: "Format tanggal tidak valid (gunakan YYYY-MM-DD)" },
  )
  @IsNotEmpty({ message: "Tanggal transaksi wajib diisi" })
  transactionDate!: string;

  @IsEnum(TransactionType, { message: "Tipe harus INCOME atau EXPENSE" })
  @IsNotEmpty()
  type!: TransactionType;

  @Type(() => Number)
  @IsNumber({}, { message: "Jumlah (amount) harus berupa angka" })
  @Min(1, { message: "Jumlah tidak boleh kurang dari 1" })
  @IsNotEmpty()
  amount!: number;

  @IsString()
  @IsNotEmpty({ message: "Deskripsi wajib diisi (contoh: Gaji Budi Feb 2026)" })
  description!: string;

  @IsString()
  @IsNotEmpty({ message: "Kategori ID wajib diisi" })
  categoryId!: string;

  // === OPTIONAL FIELDS ===

  @IsString()
  @IsOptional()
  referenceNumber?: string; // Nomor referensi transfer bank / invoice internal

  @IsEnum(PaymentMethod, { message: "Metode pembayaran tidak valid" })
  @IsOptional()
  method?: PaymentMethod;

  @IsString()
  @IsOptional()
  salesId?: string; // Jika pengeluaran ini untuk komisi sales tertentu
}

// DTO untuk Update (Semua field jadi opsional)
export class UpdateFinanceTransactionDTO {
  @IsDateString()
  @IsOptional()
  transactionDate?: string;

  @IsEnum(TransactionType)
  @IsOptional()
  type?: TransactionType;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @IsString()
  @IsOptional()
  salesId?: string;
}
