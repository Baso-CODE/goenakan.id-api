import { Type } from "class-transformer";
import { IsInt, IsString, IsUUID, Matches, Min } from "class-validator";

export class MatchWhatsappLeadDTO {
  @IsString()
  @Matches(/^GK-[A-HJ-KM-NP-Z2-9]{5}$/)
  code!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  leadId!: number;
}

export class MatchWhatsappQuotationDTO {
  @IsString()
  @Matches(/^GK-[A-HJ-KM-NP-Z2-9]{5}$/)
  code!: string;

  @IsUUID()
  quotationId!: string;
}

export class MatchWhatsappOrderDTO {
  @IsString()
  @Matches(/^GK-[A-HJ-KM-NP-Z2-9]{5}$/)
  code!: string;

  @IsUUID()
  orderId!: string;
}
