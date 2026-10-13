import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { CreateQuotationItemDTO } from "./quotation-item.dto";

const EmptyStringToUndefined = Transform(({ value }) =>
  value === "" || value === null ? undefined : value,
);

export class QuotationNoteInputDTO {
  @IsNotEmpty()
  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID()
  templateId?: string | null;

  @IsNotEmpty()
  @IsString()
  content!: string;
}

export class CreateQuotationDTO {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID(4)
  userId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID(4)
  salesId?: string;

  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID(4)
  picId?: string;

  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDTO)
  items!: CreateQuotationItemDTO[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationNoteInputDTO)
  notes?: QuotationNoteInputDTO[];
}

export class UpdateQuotationDTO {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID(4)
  userId?: string;

  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID(4)
  picId?: string;

  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationNoteInputDTO)
  notes?: QuotationNoteInputDTO[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDTO)
  items?: CreateQuotationItemDTO[];
}
