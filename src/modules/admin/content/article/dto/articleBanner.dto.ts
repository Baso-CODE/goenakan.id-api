import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateArticleBannerDTO {
  @IsString({ message: "Article ID harus berupa teks" })
  @IsNotEmpty({ message: "Article ID tidak boleh kosong" })
  articleId!: string;

  @IsString({ message: "Background color harus berupa teks" })
  @IsNotEmpty({ message: "Background color tidak boleh kosong" })
  backgroundColor!: string;

  @IsString({ message: "Button text harus berupa teks" })
  @IsNotEmpty({ message: "Button text tidak boleh kosong" })
  buttonText!: string;

  @IsString({ message: "CTA Link harus berupa teks" })
  @IsNotEmpty({ message: "CTA Link tidak boleh kosong" })
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
  buttonText?: string;

  @IsString()
  @IsOptional()
  ctaLink?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
