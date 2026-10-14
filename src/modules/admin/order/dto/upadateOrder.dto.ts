import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { OrderProductDTO, SampleFollowUpDTO } from "./createOrder.dto";

const transformArray = ({ value }: { value: unknown }) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return value;
    }
  }
  return value;
};

export class UpdateOrderDTO {
  @IsOptional()
  @IsDateString()
  dateOrder?: string;

  @IsOptional()
  @IsEnum(["SALES", "SAMPLE"])
  salesCategory?: "SALES" | "SAMPLE";

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientB2BPICId?: string | null;

  @IsOptional()
  @IsString()
  purchaseChannelId?: string | null;

  @IsOptional()
  @IsString()
  referenceQuotationId?: string | null;

  @IsOptional()
  @IsString()
  referenceSampleId?: string | null;

  @IsOptional()
  @IsString()
  updatedById?: string;

  @IsOptional()
  @IsString()
  clientPoNumber?: string | null;

  @IsOptional()
  clientPoFile?: unknown;

  @IsOptional()
  @IsString()
  remark?: string | null;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  shippingAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  warrantyDays?: number | null;

  @IsOptional()
  @Transform(transformArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SampleFollowUpDTO)
  sampleFollowUps?: SampleFollowUpDTO[];

  @IsOptional()
  @Transform(transformArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderProductDTO)
  products?: OrderProductDTO[];
}
