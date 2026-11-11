import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateProductUrlRequestDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "newSlug harus berupa slug lowercase dengan tanda hubung",
  })
  newSlug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
