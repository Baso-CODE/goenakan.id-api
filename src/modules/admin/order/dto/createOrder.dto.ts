import { Transform, Type } from "class-transformer"; //  Tambahkan Transform di sini
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
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

export class SampleFollowUpDTO {
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

export class OrderProductDTO {
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
  @IsObject({
    message: "selectedAttributes harus berupa objek JSON yang valid",
  })
  selectedAttributes?: Record<string, any>;

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

  //  KOLOM OPSIONAL UNTUK NOMOR PO
  @IsOptional()
  @IsString()
  clientPoNumber?: string;

  //  TAMBAHAN: KOLOM OPSIONAL UNTUK FILE PO
  @IsOptional()
  clientPoFile?: any;

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

  @IsString()
  @IsNotEmpty()
  shippingAddress!: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        return [];
      }
    }
    return Array.isArray(value) ? value : [];
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SampleFollowUpDTO)
  sampleFollowUps?: SampleFollowUpDTO[];

  @Transform(({ value }) => {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        return [];
      }
    }
    return Array.isArray(value) ? value : [];
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderProductDTO)
  products!: OrderProductDTO[];
}
