import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";

export class UpdateAppSettingDTO {
  @IsOptional()
  @IsString()
  googleAnalyticsId?: string;

  @IsOptional()
  @IsBoolean()
  googleAnalyticsEnabled?: boolean;

  @IsOptional()
  @IsString()
  googleAdsId?: string;

  @IsOptional()
  @IsBoolean()
  googleAdsEnabled?: boolean;

  @IsOptional()
  @IsString()
  gtmId?: string;

  @IsOptional()
  @IsBoolean()
  gtmEnabled?: boolean;

  @IsOptional()
  @IsString()
  googleSiteVerification?: string;

  @IsOptional()
  @IsString()
  pixelId?: string;

  @IsOptional()
  @IsBoolean()
  pixelEnabled?: boolean;

  @IsOptional()
  @IsString()
  microsoftClarityId?: string;

  @IsOptional()
  @IsBoolean()
  microsoftClarityEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  globalForeignPriceAdjuster?: number;
}
