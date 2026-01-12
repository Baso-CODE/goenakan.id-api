import { IsNotEmpty, IsString } from "class-validator";

export class CreateNoteCategoryDTO {
  @IsNotEmpty()
  @IsString()
  name!: string;
}
