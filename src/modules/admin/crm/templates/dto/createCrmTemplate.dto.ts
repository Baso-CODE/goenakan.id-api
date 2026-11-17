import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateCrmTemplateDTO {
  @IsNotEmpty({ message: "Judul template tidak boleh kosong" })
  @IsString()
  title!: string;

  @IsNotEmpty({ message: "Isi template pesan tidak boleh kosong" })
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  shortcut?: string;
}
