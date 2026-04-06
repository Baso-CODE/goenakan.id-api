import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

class SampleFollowUpDTO {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  nextAction?: string;

  @IsOptional()
  @IsBoolean()
  isDone?: boolean;
}
class OrderProductDTO {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string; // Biarkan ? karena ini opsional

  @IsNumber()
  quantity!: number;

  @IsNumber()
  price!: number;

  @IsOptional()
  @IsString()
  customization?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateOrderDTO {
  @IsDateString()
  dateOrder!: string;

  @IsEnum(["SALES", "SAMPLE"])
  salesCategory!: "SALES" | "SAMPLE";

  @IsString()
  @IsNotEmpty()
  poNumber!: string;

  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsOptional()
  @IsString()
  clientB2BPICId?: string;

  @IsOptional()
  @IsString()
  purchaseChannelId?: string;

  @IsString()
  @IsNotEmpty()
  salesId!: string;

  @IsString()
  @IsNotEmpty()
  shippingAddress!: string;

  @IsArray()
  @IsString({ each: true })
  vendorIds!: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SampleFollowUpDTO)
  sampleFollowUps?: SampleFollowUpDTO[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderProductDTO)
  products!: OrderProductDTO[];
}
