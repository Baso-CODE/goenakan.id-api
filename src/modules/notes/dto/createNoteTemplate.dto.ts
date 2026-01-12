import { IsNotEmpty, IsString, IsUUID } from "class-validator";

export class CreateNoteTemplateDTO {
  @IsNotEmpty()
  @IsUUID()
  categoryId!: string; // ID Kategori (Relasi)

  @IsNotEmpty()
  @IsString()
  title!: string; // Judul Template (misal: "Standard Delivery")

  @IsNotEmpty()
  @IsString()
  content!: string; // Isi Catatan
}
