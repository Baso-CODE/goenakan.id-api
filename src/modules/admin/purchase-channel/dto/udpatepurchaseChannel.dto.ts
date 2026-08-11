import { IsOptional, IsString, IsBoolean } from "class-validator";

export class UpdatePurchaseChannelDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
