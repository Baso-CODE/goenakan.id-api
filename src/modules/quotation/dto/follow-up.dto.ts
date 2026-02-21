import { Type } from "class-transformer";
import { IsDate, IsNotEmpty, IsOptional, IsString } from "class-validator";

// === CREATE FOLLOW UP ===
export class CreateFollowUpDTO {
  // Quotation ID diambil dari URL params (/:id/follow-up), jadi tidak wajib di body

  @IsNotEmpty()
  @IsString()
  name!: string; // "Follow Up 1", "Convert to Sample", "Convert to Sales"

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date; // Tanggal follow up dilakukan (default now)

  @IsOptional() // Diubah menjadi optional agar saat "Convert" tidak wajib diisi
  @IsString()
  method?: string; // WhatsApp, Email, Call, Visit, dll

  @IsOptional()
  @IsString()
  notes?: string; // Hasil pembicaraan atau catatan konversi

  @IsOptional()
  @IsString()
  nextAction?: string; // "Hubungi lagi besok" atau "Lanjut produksi"
}

// === UPDATE FOLLOW UP ===
export class UpdateFollowUpDTO {
  @IsOptional()
  @IsString()
  name?: string; // Memungkinkan update nama aktivitas jika ada typo

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
