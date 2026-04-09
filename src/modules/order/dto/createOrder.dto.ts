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
    // Price harus ada dan merupakan number >= 0
    if (value === null || value === undefined) {
      return false;
    }

    const price = Number(value);

    // Validasi: price harus number dan >= 0
    if (isNaN(price) || price < 0) {
      return false;
    }

    // ✅ Allow 0 untuk SAMPLE orders
    // Number 0 adalah valid
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
    {
      message: "price must be a valid number",
    },
  )
  @Validate(IsValidPriceConstraint, {
    message: "price must be a number >= 0",
  })
  price?: number; // ✅ Changed from ! to ?

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
