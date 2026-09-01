import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateProductCategoryDTO {
  @IsNotEmpty()
  @IsString()
  name_id!: string;

  @IsOptional()
  @IsString()
  name_en?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  imageId?: string;

  @IsOptional()
  @IsString()
  description_id?: string;

  @IsOptional()
  @IsString()
  description_en?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
