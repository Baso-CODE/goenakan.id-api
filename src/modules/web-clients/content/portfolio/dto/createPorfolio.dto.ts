import { Type } from "class-transformer";
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreatePortfolioDTO {
  @IsNotEmpty({ message: "Judul portofolio wajib diisi" })
  @IsString()
  title!: string;

  @IsNotEmpty({ message: "Nama klien wajib diisi" })
  @IsString()
  clientName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "Display order harus berupa angka" })
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsString()
  isActive?: string;
}
