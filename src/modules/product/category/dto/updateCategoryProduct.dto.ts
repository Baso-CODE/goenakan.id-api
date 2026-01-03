import { IsOptional, IsString } from "class-validator";

export class UpdateProductCategoryDTO {
  @IsOptional()
  @IsString()
  name?: string;
}
