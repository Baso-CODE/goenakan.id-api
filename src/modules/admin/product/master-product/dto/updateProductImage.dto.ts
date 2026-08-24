import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateProductImageDTO {
  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  attributeValueId?: string | null;

  @IsOptional()
  @IsString()
  mockupSideName?: string | null;

  @IsOptional()
  @IsString()
  printPositionValueId?: string | null;

  @IsOptional()
  @IsString()
  printSideValueId?: string | null;

  @IsOptional()
  @IsBoolean()
  deleteColorMask?: boolean;
}
