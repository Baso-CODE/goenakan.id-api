import { IsNotEmpty, IsString } from "class-validator";

export class CreateProductCategoryDTO {
  @IsNotEmpty()
  @IsString()
  name!: string;
}
