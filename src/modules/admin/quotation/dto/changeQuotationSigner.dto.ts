import { Transform } from "class-transformer";
import {
  IsDefined,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class ChangeQuotationSignerDTO {
  @IsDefined()
  @IsUUID("4")
  signerUserId!: string;

  @IsDefined()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(10, {
    message: "Alasan minimal 10 karakter.",
  })
  @MaxLength(500)
  reason!: string;
}
