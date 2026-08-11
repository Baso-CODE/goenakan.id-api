import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class CreateArticleTagDTO {
  @IsString({ message: "Nama tag harus berupa teks" })
  @IsNotEmpty({ message: "Nama tag tidak boleh kosong" })
  @MinLength(2, { message: "Nama tag minimal 2 karakter" })
  name!: string;

  @IsString({ message: "Slug harus berupa teks" })
  @IsOptional()
  slug?: string;
}

export class UpdateArticleTagDTO {
  @IsString({ message: "Nama tag harus berupa teks" })
  @IsOptional()
  name?: string;

  @IsString({ message: "Slug harus berupa teks" })
  @IsOptional()
  slug?: string;

  @IsBoolean({ message: "Status harus berupa boolean" })
  @IsOptional()
  isActive?: boolean;
}
