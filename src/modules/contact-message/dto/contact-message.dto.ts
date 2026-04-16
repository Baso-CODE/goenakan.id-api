import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateContactMessageDTO {
  @IsString()
  @IsNotEmpty({ message: "Nama tidak boleh kosong" })
  name!: string;

  @IsEmail({}, { message: "Format email tidak valid" })
  @IsNotEmpty({ message: "Email tidak boleh kosong" })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: "Nomor HP/WhatsApp tidak boleh kosong" })
  phone!: string;

  @IsString()
  @IsOptional()
  interest?: string;

  @IsString()
  @IsNotEmpty({ message: "Pesan tidak boleh kosong" })
  message!: string;
}
