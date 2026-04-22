import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateAddressDTO {
  @IsString()
  @IsNotEmpty({ message: "Label alamat wajib diisi (misal: Rumah, Kantor)" })
  label!: string;

  @IsString()
  @IsNotEmpty({ message: "Nama penerima wajib diisi" })
  recipient!: string;

  @IsString()
  @IsNotEmpty({ message: "Nomor handphone penerima wajib diisi" })
  phone!: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  province?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsString()
  @IsNotEmpty({ message: "Alamat lengkap wajib diisi" })
  fullAddress!: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateAddressDTO {
  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  recipient?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  province?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsString()
  @IsOptional()
  fullAddress?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
