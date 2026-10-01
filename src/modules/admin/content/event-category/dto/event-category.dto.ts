import { Type } from "class-transformer";
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateEventCategoryDTO {
  @IsNotEmpty({ message: "Judul kategori event (ID) wajib diisi" })
  @IsString()
  title_id!: string;

  @IsOptional()
  @IsString()
  title_en?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "Order count harus berupa angka" })
  @Min(0, { message: "Order count tidak boleh kurang dari 0" })
  orderCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "Display order harus berupa angka" })
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsString()
  isActive?: string;
}

export class UpdateEventCategoryDTO {
  @IsOptional()
  @IsString()
  title_id?: string;

  @IsOptional()
  @IsString()
  title_en?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "Order count harus berupa angka" })
  @Min(0)
  orderCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "Display order harus berupa angka" })
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsString()
  isActive?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  imageId?: string;
}
