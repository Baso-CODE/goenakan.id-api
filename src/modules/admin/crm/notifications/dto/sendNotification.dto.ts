import { Type } from "class-transformer";
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";

export enum NotificationCategory {
  INVOICE = "INVOICE",
  PAYMENT = "PAYMENT",
  PRODUCTION = "PRODUCTION",
  SHIPPING = "SHIPPING",
  GENERAL = "GENERAL",
}

export class SendNotificationDTO {
  @IsString({ message: "Nomor WhatsApp (phoneNumber) harus berupa teks" })
  @IsNotEmpty({ message: "Nomor WhatsApp (phoneNumber) wajib diisi" })
  phoneNumber!: string;

  // Skenario A: Menggunakan Template CRM
  @IsOptional()
  @IsString({ message: "Template harus berupa string (shortcut, ID, atau judul)" })
  template?: string;

  // Variabel untuk placeholder {{variabel}}
  @IsOptional()
  @IsObject({ message: "Variables harus berupa key-value object" })
  variables?: Record<string, string | number>;

  // Skenario B: Pesan teks langsung
  @IsOptional()
  @IsString({ message: "Pesan (message) harus berupa teks" })
  message?: string;

  // Media & Attachment (URL atau Base64)
  @IsOptional()
  @IsString({ message: "mediaUrl harus berupa link URL valid" })
  mediaUrl?: string;

  @IsOptional()
  @IsString({ message: "mediaBase64 harus berupa string base64" })
  mediaBase64?: string;

  @IsOptional()
  @IsString({ message: "fileName harus berupa string" })
  fileName?: string;

  @IsOptional()
  @IsString({ message: "mediaCaption harus berupa teks" })
  mediaCaption?: string;

  // Metadata Audit & Kategori ERP
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;
}
