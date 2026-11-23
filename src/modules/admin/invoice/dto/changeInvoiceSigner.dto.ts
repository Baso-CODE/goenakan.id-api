import { Transform } from "class-transformer";
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class ChangeInvoiceSignerDTO {
  @IsUUID("4")
  @IsNotEmpty()
  signerUserId!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(10, {
    message: "Alasan minimal 10 karakter.",
  })
  @MaxLength(500)
  reason!: string;
}
