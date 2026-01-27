import { Type } from "class-transformer";
import { IsDate, IsNotEmpty, IsOptional, IsString } from "class-validator";

// === CREATE FOLLOW UP ===
export class CreateFollowUpDTO {
  // Quotation ID diambil dari URL params (/:id/follow-up), jadi tidak wajib di body

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date; // Tanggal follow up dilakukan (default now)

  @IsNotEmpty()
  @IsString()
  method!: string; // WhatsApp, Email, Call, Visit

  @IsOptional()
  @IsString()
  notes?: string; // Hasil pembicaraan: "Client minta turun harga"

  @IsOptional()
  @IsString()
  nextAction?: string; // "Hubungi lagi besok"
}

// === UPDATE FOLLOW UP ===
export class UpdateFollowUpDTO {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  nextAction?: string;
}
