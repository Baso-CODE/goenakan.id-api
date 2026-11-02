import { Type } from "class-transformer";
import {
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

const ATTRIBUTION_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "gad_source",
  "gad_campaignid",
  "fbclid",
  "ttclid",
] as const;

export type AttributionParams = Partial<
  Record<(typeof ATTRIBUTION_PARAMS)[number], string>
>;

export class AttributionVisitDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  landing_page!: string;

  @IsISO8601()
  timestamp!: string;

  @IsObject()
  params!: AttributionParams;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  referrer?: string | null;
}

export class WhatsappAttributionDTO {
  @IsOptional()
  @ValidateNested()
  @Type(() => AttributionVisitDTO)
  first?: AttributionVisitDTO | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => AttributionVisitDTO)
  last?: AttributionVisitDTO | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ga_client_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ga_session_id?: string | null;
}

export class CreateWhatsappClickDTO {
  @IsString()
  @Matches(/^GK-[A-HJ-NP-Z2-9]{5}$/, {
    message: "Format kode WhatsApp tidak valid.",
  })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  @Matches(/^\//, {
    message: "page_path harus berupa path halaman.",
  })
  page_path!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: "cta_name harus menggunakan huruf kecil dan underscore.",
  })
  cta_name!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => WhatsappAttributionDTO)
  attribution!: WhatsappAttributionDTO;
}
