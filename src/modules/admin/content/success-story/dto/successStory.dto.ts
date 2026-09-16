import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateSuccessStoryDTO {
  @IsNotEmpty()
  @IsString()
  clientName!: string;

  @IsNotEmpty()
  @IsString()
  titleId!: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsString()
  @IsNotEmpty()
  heroImageUrl!: string;

  @IsString()
  @IsOptional()
  media1Url?: string;

  @IsString()
  @IsOptional()
  media2Url?: string;

  @IsOptional()
  @IsString()
  titleEn?: string;

  @IsNotEmpty()
  @IsString()
  sideContentHtmlId!: string;

  @IsOptional()
  @IsString()
  sideContentHtmlEn?: string;

  @IsOptional()
  @IsString()
  mainContentHtmlId?: string;

  @IsOptional()
  @IsString()
  mainContentHtmlEn?: string;
}

export class UpdateSuccessStoryDTO {
  @IsOptional()
  @IsString()
  clientName?: string;

  @IsNotEmpty()
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  titleId?: string;

  @IsOptional()
  @IsString()
  titleEn?: string;

  @IsOptional()
  @IsString()
  sideContentHtmlId?: string;

  @IsOptional()
  @IsString()
  sideContentHtmlEn?: string;

  @IsOptional()
  @IsString()
  mainContentHtmlId?: string;

  @IsOptional()
  @IsString()
  mainContentHtmlEn?: string;
}
