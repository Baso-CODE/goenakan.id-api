import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateProductImageDTO {
  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}
