import { PaymentMethod } from "@prisma/client";
import { IsDateString, IsEnum, IsNotEmpty } from "class-validator";

export class PayInvoiceDTO {
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsNotEmpty()
  @IsDateString()
  paymentDate!: string;
}
