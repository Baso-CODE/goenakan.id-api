import { IsNotEmpty, IsEnum, IsDateString, IsOptional } from "class-validator";
import { PaymentMethod, InvoiceStatus } from "./createInvoice.dto";

export class PayInvoiceDTO {
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsNotEmpty()
  @IsDateString()
  paymentDate!: string;
}
