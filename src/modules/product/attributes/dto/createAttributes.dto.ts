import { IsNotEmpty, IsString, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class CreateAttributeValueDTO {
  @IsNotEmpty()
  @IsString()
  value!: string;
}

export class CreateAttributeDTO {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAttributeValueDTO)
  values!: CreateAttributeValueDTO[];
}
