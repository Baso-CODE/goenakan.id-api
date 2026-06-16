import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class CreateUserDTO {
  @IsNotEmpty({ message: "Nama tidak boleh kosong" })
  @IsString()
  name!: string;

  @IsNotEmpty({ message: "Email tidak boleh kosong" })
  @IsEmail({}, { message: "Format email tidak valid" })
  email!: string;

  @IsNotEmpty({ message: "Password tidak boleh kosong" })
  @MinLength(6, { message: "Password minimal 6 karakter" })
  password!: string;

  @IsNotEmpty({ message: "Role ID tidak boleh kosong" })
  @IsString()
  roleId!: string;

  @IsOptional()
  @IsString()
  image?: string;
}
