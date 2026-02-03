// src/modules/invoice/dto/createInvoice.dto.ts
import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

// Sesuaikan dengan Enum di Schema.prisma Anda
export enum InvoiceCategory {
  DP = "DP",
  FULL_PAYMENT = "FULL_PAYMENT",
  INSTALLMENT = "INSTALLMENT",
  REMAINING_BALANCE = "REMAINING_BALANCE",
}

export enum InvoiceStatus {
  DRAFT = "DRAFT",
  UNPAID = "UNPAID",
  PAID = "PAID",
}

export enum PaymentMethod {
  BANK_TRANSFER = "BANK_TRANSFER",
  CASH = "CASH",
  CREDIT_CARD = "CREDIT_CARD",
  QRIS = "QRIS",
}
class SelectedItemDTO {
  @IsNotEmpty()
  @IsString()
  productId!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantity!: number;
}
// DTO untuk setiap Note
class InvoiceNoteInputDTO {
  @IsNotEmpty()
  @IsString()
  categoryId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contents!: string[];
}

export class CreateInvoiceDTO {
  @IsNotEmpty()
  @IsString()
  orderId!: string;

  @IsNotEmpty()
  @IsEnum(InvoiceCategory)
  category!: InvoiceCategory;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus = InvoiceStatus.UNPAID;

  @IsOptional()
  @IsString()
  dueDate?: string; // Format YYYY-MM-DD

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  remarks?: string; // Catatan, misal: "Cicilan 1 dari 3"

  // === Field Khusus Perhitungan ===

  // Jika Category = DP, isi field ini (0 - 100)
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  dpPercentage?: number;

  // Jika Category = INSTALLMENT / REMAINING, bisa isi nominal manual
  @IsOptional()
  @IsNumber()
  @Min(0)
  customAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true }) // Validasi setiap item di array
  @Type(() => SelectedItemDTO) // Transform plain object ke instance class DTO
  selectedItems?: SelectedItemDTO[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceNoteInputDTO)
  notes?: InvoiceNoteInputDTO[];
}
