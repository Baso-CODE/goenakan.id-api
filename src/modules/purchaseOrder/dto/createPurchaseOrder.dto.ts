import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

// ==========================================
// ENUMS (Harus sesuai dengan Prisma Schema)
// ==========================================
export enum PurchaseType {
  DIRECT_MATERIAL = "DIRECT_MATERIAL",
  DIRECT_EXPENSES = "DIRECT_EXPENSES",
  INDIRECT_EXPENSES = "INDIRECT_EXPENSES",
  STOCK = "STOCK",
}

export enum ExpenseCategory {
  PRODUCT = "PRODUCT",
  PACKAGING = "PACKAGING",
  LOGISTIC = "LOGISTIC",
  UTILITY = "UTILITY",
}

export enum PaymentTerm {
  IMMEDIATELY = "IMMEDIATELY",
  NET_14 = "NET_14",
  NET_30 = "NET_30",
  NET_60 = "NET_60",
}

// ==========================================
// DTO UNTUK ITEM PURCHASE ORDER
// ==========================================
class PurchaseOrderItemDTO {
  @IsString()
  @IsNotEmpty({ message: "Item name is required" })
  itemName!: string;

  // Opsional: Diisi jika user memilih item dari database master product
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  // Opsional: Referensi SO/SN dari Order tabel
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsNumber()
  @Min(1, { message: "Quantity order must be at least 1" })
  quantityOrder!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityStock?: number;

  @IsNumber()
  @Min(0, { message: "Quantity purchase cannot be negative" })
  quantityPurchase!: number;

  @IsString()
  @IsNotEmpty({ message: "UOM (Unit of Measurement) is required" })
  uom!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0, { message: "Unit price cannot be negative" })
  unitPrice!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
// ==========================================
// MAIN DTO UNTUK CREATE PURCHASE ORDER
// ==========================================
export class CreatePurchaseOrderDTO {
  @IsOptional()
  @IsString()
  poNumber?: string;

  @IsDateString(
    {},
    { message: "PO Date must be a valid date string (YYYY-MM-DD)" },
  )
  poDate!: string;

  @IsEnum(PurchaseType, { message: "Invalid purchase type" })
  purchaseType!: PurchaseType;

  @IsEnum(ExpenseCategory, { message: "Invalid expense category" })
  expenseCategory!: ExpenseCategory;

  @IsEnum(PaymentTerm, { message: "Invalid payment terms" })
  paymentTerms!: PaymentTerm;

  @IsString()
  @IsNotEmpty({ message: "Vendor is required" })
  vendorId!: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  createdById?: string;

  @IsOptional()
  @IsString()
  updatedById?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDTO)
  @IsNotEmpty({
    message: "At least one item is required in the purchase order",
  })
  items!: PurchaseOrderItemDTO[];
}
