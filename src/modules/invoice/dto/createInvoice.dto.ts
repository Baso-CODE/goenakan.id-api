// src/modules/invoice/dto/createInvoice.dto.ts
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
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
}
