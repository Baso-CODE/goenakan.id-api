import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsDate,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { CreateQuotationItemDTO } from "./quotation-item.dto";

// Helper transform: ubah string kosong "" → undefined
// Sehingga @IsOptional() bisa mengabaikannya dan @IsUUID tidak error
const EmptyStringToUndefined = Transform(({ value }) =>
  value === "" || value === null ? undefined : value,
);

export class QuotationNoteInputDTO {
  @IsNotEmpty()
  @IsUUID()
  categoryId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contents!: string[];
}

export class CreateQuotationDTO {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;

  // ✅ salesId: "" dari frontend → undefined → lolos @IsOptional
  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID(4)
  salesId?: string;

  // ✅ picId: "" dari frontend → undefined → lolos @IsOptional
  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID(4)
  picId?: string;

  // ✅ clientId: "" dari frontend → undefined → lolos @IsOptional
  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  manualClientName?: string;

  @IsOptional()
  @IsString()
  manualClientCompany?: string;

  // ✅ manualClientEmail: "" → undefined → skip @IsEmail validation
  @IsOptional()
  @EmptyStringToUndefined
  @IsEmail()
  manualClientEmail?: string;

  @IsOptional()
  @IsString()
  manualClientPhone?: string;

  @IsOptional()
  @IsString()
  manualClientAddress?: string;

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
  picId?: string;

  @IsOptional()
  @EmptyStringToUndefined
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  manualClientName?: string;

  @IsOptional()
  @IsString()
  manualClientCompany?: string;

  @IsOptional()
  @EmptyStringToUndefined
  @IsEmail()
  manualClientEmail?: string;

  @IsOptional()
  @IsString()
  manualClientPhone?: string;

  @IsOptional()
  @IsString()
  manualClientAddress?: string;

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
