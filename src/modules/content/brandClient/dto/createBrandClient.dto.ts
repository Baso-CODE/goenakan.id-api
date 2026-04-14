import { Type } from "class-transformer";
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from "class-validator";

export class CreateBrandClientDTO {
  @IsNotEmpty({ message: "Nama client tidak boleh kosong" })
  @IsString()
  name!: string;

  @IsNotEmpty({ message: "Asal negara tidak boleh kosong" })
  @IsString()
  country!: string;

  @IsOptional()
  @IsUrl({}, { message: "Format website URL tidak valid" })
  websiteUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "Display order harus berupa angka" })
  @Min(0, { message: "Display order minimal bernilai 0" })
  displayOrder?: number;
}
