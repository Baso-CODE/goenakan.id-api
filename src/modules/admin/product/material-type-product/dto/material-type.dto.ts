import { IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class CreateMaterialTypeDTO {
  @IsString({ message: "Nama material harus berupa string" })
  @IsNotEmpty({ message: "Nama material tidak boleh kosong" })
  @MinLength(2, { message: "Nama material minimal 2 karakter" })
  name!: string;

  @IsString({ message: "Deskripsi harus berupa string" })
  @IsOptional()
  description?: string;
}

export class UpdateMaterialTypeDTO {
  @IsString({ message: "Nama material harus berupa string" })
  @IsOptional()
  @MinLength(2, { message: "Nama material minimal 2 karakter" })
  name?: string;

  @IsString({ message: "Deskripsi harus berupa string" })
  @IsOptional()
  description?: string;
}
