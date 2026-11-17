import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateCrmLabelDTO {
  @IsNotEmpty({ message: "Nama label tidak boleh kosong" })
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
