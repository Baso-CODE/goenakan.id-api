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
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

@ValidatorConstraint({ name: "isValidPrice", async: false })
export class IsValidPriceConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    if (value === null || value === undefined) {
      return false;
    }
    const price = Number(value);
    if (isNaN(price) || price < 0) {
      return false;
    }
    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return "price must be a number >= 0";
  }
}

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
  variantId?: string;

  @IsNumber()
  quantity!: number;

  @IsOptional()
  @IsNumber(
    { allowInfinity: false, allowNaN: false },
    { message: "price must be a valid number" },
  )
  @Validate(IsValidPriceConstraint, {
    message: "price must be a number >= 0",
  })
  price?: number;

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

  @IsOptional()
  @IsString()
  clientPoNumber?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  referenceQuotationId?: string;

  @IsOptional()
  @IsString()
  referenceSampleId?: string;

  @IsOptional()
  @IsString()
  createdById?: string;

  @IsOptional()
  @IsString()
  updatedById?: string;

  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsOptional()
  @IsString()
  clientB2BPICId?: string;

  @IsOptional()
  @IsString()
  purchaseChannelId?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  warrantyDays?: number | null;

  // @IsString()
  // @IsNotEmpty()
  // salesId!: string;

  @IsString()
  @IsNotEmpty()
  shippingAddress!: string;

  // @IsArray()
  // @IsString({ each: true })
  // vendorIds!: string[];

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
