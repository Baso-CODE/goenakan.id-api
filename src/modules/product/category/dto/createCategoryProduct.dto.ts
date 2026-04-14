import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateProductCategoryDTO {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  imageId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
