import { IsOptional, IsString } from "class-validator";

export class UpdateProductCategoryDTO {
  @IsOptional()
  @IsString()
  name_id?: string;

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
}
