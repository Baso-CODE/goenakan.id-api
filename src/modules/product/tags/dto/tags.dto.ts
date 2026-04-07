import { IsNotEmpty, IsOptional, IsString } from "class-validator";

// === DTO UNTUK CREATE TAG ===
export class CreateTagDTO {
  @IsNotEmpty({ message: "Nama tag tidak boleh kosong" })
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;
}

// === DTO UNTUK UPDATE TAG ===
export class UpdateTagDTO {
  @IsOptional()
  @IsNotEmpty({ message: "Nama tag tidak boleh kosong jika ingin diubah" })
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;
}
