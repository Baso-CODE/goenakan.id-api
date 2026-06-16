import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateRoleDTO {
  @IsNotEmpty({ message: "Nama role tidak boleh kosong" })
  @IsString()
  @MaxLength(50, { message: "Nama role maksimal 50 karakter" })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: "Deskripsi maksimal 255 karakter" })
  description?: string;
}

export class UpdateRoleDTO {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
