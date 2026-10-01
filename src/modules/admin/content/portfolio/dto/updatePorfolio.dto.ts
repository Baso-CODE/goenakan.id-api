import { Type } from "class-transformer";
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
export class UpdatePortfolioDTO {
  @IsOptional()
  @IsString()
  title_id?: string;

  @IsOptional()
  @IsString()
  title_en?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  description_en?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderQuantity?: number;

  @IsOptional()
  @IsDateString()
  projectDate?: string;

  @IsOptional()
  @IsString()
  eventCategoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsString()
  isActive?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  imageId?: string;
}
