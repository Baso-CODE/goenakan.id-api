import { IsNotEmpty, IsString } from "class-validator";

export class CreateAttributeValueDTO {
  @IsNotEmpty()
  @IsString()
  value!: string;

  @IsNotEmpty()
  @IsString()
  attributeId!: string;
}
