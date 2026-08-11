import { TransactionType } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

// === DTO UNTUK CREATE ===
export class CreateFinanceCategoryDTO {
  @IsString()
  @IsNotEmpty({ message: "Nama kategori wajib diisi" })
  @MaxLength(100, { message: "Nama kategori maksimal 100 karakter" })
  name!: string;

  @IsEnum(TransactionType, { message: "Tipe harus INCOME atau EXPENSE" })
  @IsNotEmpty({ message: "Tipe kategori wajib dipilih" })
  type!: TransactionType;

  @IsString()
  @IsOptional()
  description?: string;
}

// === DTO UNTUK UPDATE ===
export class UpdateFinanceCategoryDTO {
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: "Nama kategori maksimal 100 karakter" })
  name?: string;

  @IsEnum(TransactionType, { message: "Tipe harus INCOME atau EXPENSE" })
  @IsOptional()
  type?: TransactionType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean({ message: "Status aktif harus berupa boolean (true/false)" })
  @IsOptional()
  isActive?: boolean;
}
