import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateArticleBannerDTO {
  @IsString()
  @IsNotEmpty()
  articleId!: string;

  @IsString()
  @IsNotEmpty()
  backgroundColor!: string;

  @IsString()
  @IsNotEmpty()
  buttonTextId!: string;

  @IsString()
  @IsNotEmpty()
  ctaLink!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
export class UpdateArticleBannerDTO {
  @IsString()
  @IsOptional()
  articleId?: string;

  @IsString()
  @IsOptional()
  backgroundColor?: string;

  @IsString()
  @IsOptional()
  buttonTextId?: string;

  @IsString()
  @IsOptional()
  ctaLink?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
