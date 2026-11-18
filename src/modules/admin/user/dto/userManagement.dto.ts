import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class CreateUserDTO {
  @IsString()
  @IsNotEmpty({ message: "Nama wajib diisi" })
  name!: string;

  @IsEmail({}, { message: "Format email tidak valid" })
  @IsNotEmpty({ message: "Email wajib diisi" })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: "Role wajib dipilih" })
  roleId!: string;

  @IsOptional()
  @IsString()
  image?: string;
}

export class UpdateUserDTO {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: "Password minimal 8 karakter" })
  password?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  roleId?: string;
}

export class ActivateAdminAccountDTO {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(12, {
    message: "Password minimal 12 karakter",
  })
  password!: string;
}
