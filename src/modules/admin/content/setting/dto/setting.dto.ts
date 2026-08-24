import { IsOptional, IsString, IsNumber } from "class-validator";

export class UpdateAppSettingDTO {
  @IsOptional()
  @IsString()
  googleAdsId?: string;

  @IsOptional()
  @IsString()
  gtmId?: string;

  @IsOptional()
  @IsString()
  pixelId?: string;

  @IsOptional()
  @IsNumber()
  globalForeignPriceAdjuster?: number;
}
