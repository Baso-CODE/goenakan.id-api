import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateSuccessStoryDTO {
  @IsNotEmpty()
  @IsString()
  clientId!: string;

  @IsNotEmpty()
  @IsString()
  titleId!: string;

  @IsNotEmpty()
  @IsString()
  heroImageUrl!: string;

  @IsOptional()
  @IsString()
  media1Url?: string;

  @IsOptional()
  @IsString()
  media2Url?: string;

  @IsNotEmpty()
  @IsString()
  sideContentHtmlId!: string;

  @IsOptional()
  @IsString()
  mainContentHtmlId?: string;
}

export class UpdateSuccessStoryDTO {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  titleId?: string;

  @IsOptional()
  @IsString()
  heroImageUrl?: string;

  @IsOptional()
  @IsString()
  media1Url?: string;

  @IsOptional()
  @IsString()
  media2Url?: string;

  @IsOptional()
  @IsString()
  sideContentHtmlId?: string;

  @IsOptional()
  @IsString()
  mainContentHtmlId?: string;
}
