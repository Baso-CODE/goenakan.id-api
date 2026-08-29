import { AccountType } from "@prisma/client";
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from "class-validator";

export class RegisterUserDTO {
  @IsEnum(AccountType)
  @IsNotEmpty()
  accountType!: AccountType;

  @IsEmail({}, { message: "Format email tidak valid" })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @MinLength(8, { message: "Password minimal 8 karakter" })
  password!: string;

  // ==========================================
  // FIELD KHUSUS INDIVIDUAL
  // ==========================================
  @ValidateIf((o) => o.accountType === AccountType.INDIVIDUAL)
  @IsString()
  @IsNotEmpty({ message: "Nama lengkap wajib diisi untuk akun Personal" })
  fullName?: string;

  @ValidateIf((o) => o.accountType === AccountType.INDIVIDUAL)
  @IsString()
  @IsNotEmpty()
  phone?: string;

  // ==========================================
  // FIELD KHUSUS CORPORATE
  // ==========================================
  @ValidateIf((o) => o.accountType === AccountType.CORPORATE)
  @IsString()
  @IsNotEmpty({ message: "Nama PIC wajib diisi untuk akun Perusahaan" })
  picName?: string;

  @ValidateIf((o) => o.accountType === AccountType.CORPORATE)
  @IsString()
  @IsNotEmpty()
  picNumbers?: string;

  @ValidateIf((o) => o.accountType === AccountType.CORPORATE)
  @IsString()
  @IsNotEmpty()
  companyName?: string;

  @ValidateIf((o) => o.accountType === AccountType.CORPORATE)
  @IsString()
  @IsOptional()
  department?: string;

  // ==========================================
  // FIELD ALAMAT (Dibutuhkan oleh keduanya)
  // ==========================================
  @IsString()
  @IsNotEmpty({ message: "Alamat wajib diisi" })
  address!: string;
}
