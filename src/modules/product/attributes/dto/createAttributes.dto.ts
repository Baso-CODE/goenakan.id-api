import { IsNotEmpty, IsString, IsArray, ValidateNested, IsOptional } from "class-validator";
import { Type } from "class-transformer";

export class CreateAttributeValueDTO {
  @IsNotEmpty()
  @IsString()
  value!: string;

  @IsOptional()
  position?: number;
}

export class CreateAttributeDTO {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAttributeValueDTO)
  values!: CreateAttributeValueDTO[];

  @IsOptional()
  @IsString()
  productId?: string;
}
