import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateProductVideoDTO {
  @IsOptional()
  @IsString()
  title?: string; // Tambahan khusus video

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}
