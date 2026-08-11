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

  // Tanggal jatuh tempo
  @IsOptional()
  @IsString()
  dueDate?: string; // Format YYYY-MM-DD

  // 🔥 Tanggal pembayaran aktual dilakukan
  @IsOptional()
  @IsString()
  paymentDate?: string; // Format YYYY-MM-DD — diisi saat pembayaran dikonfirmasi

  // 🔥 Tanggal lunas (bisa berbeda dengan paymentDate jika ada cicilan)
  @IsOptional()
  @IsString()
  paidAt?: string; // Format YYYY-MM-DD

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  dpPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedItemDTO)
  selectedItems?: SelectedItemDTO[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceNoteInputDTO)
  notes?: InvoiceNoteInputDTO[];
}

// 🔥 UpdateInvoiceDTO — untuk konfirmasi pembayaran / update status
export class UpdateInvoiceDTO {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  // 🔥 Tanggal pembayaran aktual — diisi saat admin konfirmasi bayar
  @IsOptional()
  @IsString()
  paymentDate?: string; // Format YYYY-MM-DD

  // 🔥 Tanggal lunas
  @IsOptional()
  @IsString()
  paidAt?: string; // Format YYYY-MM-DD

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
