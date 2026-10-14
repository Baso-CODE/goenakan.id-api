import {
  InvoiceBillingMode,
  InvoiceCategory,
  InvoiceStatus,
  PaymentMethod,
} from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export {
  InvoiceBillingMode,
  InvoiceCategory,
  InvoiceStatus,
  PaymentMethod,
} from "@prisma/client";

export class SelectedInvoiceItemDTO {
  @IsNotEmpty()
  @IsUUID()
  orderProductId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class InvoiceNoteInputDTO {
  @IsNotEmpty()
  @IsUUID()
  categoryId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contents!: string[];
}

export class CreateInvoiceDTO {
  @IsNotEmpty()
  @IsUUID()
  orderId!: string;

  @IsNotEmpty()
  @IsEnum(InvoiceCategory)
  category!: InvoiceCategory;

  @IsOptional()
  @IsEnum(InvoiceBillingMode)
  billingMode?: InvoiceBillingMode = InvoiceBillingMode.STANDARD;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus = InvoiceStatus.UNPAID;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  dpPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  customAmount?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SelectedInvoiceItemDTO)
  selectedItems?: SelectedInvoiceItemDTO[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceNoteInputDTO)
  notes?: InvoiceNoteInputDTO[];
}

export class UpdateInvoiceDTO {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
